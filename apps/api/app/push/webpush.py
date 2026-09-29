"""Web Push delivery: message encryption (RFC 8291, aes128gcm per RFC 8188) and VAPID
authentication (RFC 8292), sent with httpx.

The browser gives each subscription an endpoint on its push service plus two keys: `p256dh`
(its P-256 public key) and `auth` (a 16-byte secret). Every message is encrypted to those
keys with a fresh server key pair and salt, so the push service carries it unread. The
VAPID key pair identifies this server to push services; the browser subscribed with its
public key, so the private key must stay the same for existing subscriptions to keep
working.
"""

import base64
import hmac
import os
import time
from dataclasses import dataclass
from hashlib import sha256
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

RECORD_SIZE = 4096
# Browsers' push services. Endpoints come from members, so the job only ever posts to these
# (Chrome and Android, Firefox, Safari, Edge).
PUSH_SERVICE_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")
# A message that cannot be delivered within this long is worth nothing (TTL header).
DEFAULT_TTL_SECONDS = 12 * 60 * 60
VAPID_LIFETIME_SECONDS = 12 * 60 * 60


def b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _hmac(key: bytes, data: bytes) -> bytes:
    return hmac.new(key, data, sha256).digest()


def public_bytes(key: ec.EllipticCurvePublicKey) -> bytes:
    """The uncompressed point (65 bytes) that Web Push uses for public keys."""
    return key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)


def private_key_from(value: str) -> ec.EllipticCurvePrivateKey:
    """A P-256 private key from its base64url-encoded 32-byte scalar, the format of
    `python -m app.push.keys` and of the common web-push tooling."""
    raw = b64url_decode(value.strip())
    if len(raw) != 32:
        raise ValueError("A VAPID private key is 32 bytes, base64url encoded.")
    return ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())


def allowed_endpoint(endpoint: str) -> bool:
    """An HTTPS URL on a known push service (the host or a subdomain of it)."""
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and parts.port in (None, 443)
        and any(host == allowed or host.endswith("." + allowed) for allowed in PUSH_SERVICE_HOSTS)
    )


def encrypt(
    plaintext: bytes,
    ua_public: bytes,
    auth_secret: bytes,
    *,
    server_key: ec.EllipticCurvePrivateKey | None = None,
    salt: bytes | None = None,
) -> bytes:
    """The aes128gcm body for one subscription (RFC 8291 section 3.4). `server_key` and
    `salt` are fresh for every message; they are parameters only for the RFC's test vector."""
    if len(auth_secret) != 16:
        raise ValueError("The subscription's auth secret is 16 bytes.")
    server_key = server_key or ec.generate_private_key(ec.SECP256R1())
    salt = salt or os.urandom(16)
    ua_key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    as_public = public_bytes(server_key.public_key())
    shared = server_key.exchange(ec.ECDH(), ua_key)
    prk_key = _hmac(auth_secret, shared)
    ikm = _hmac(prk_key, b"WebPush: info\x00" + ua_public + as_public + b"\x01")
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    # One record: the plaintext, then the last-record delimiter.
    if len(plaintext) + 1 + 16 > RECORD_SIZE:
        raise ValueError("The message is too long for one record.")
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(as_public)]) + as_public
    return header + ciphertext


def vapid_header(endpoint: str, key: ec.EllipticCurvePrivateKey, subject: str, now: float | None = None) -> str:
    """The `Authorization` header for a push service (RFC 8292 section 3)."""
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int((now if now is not None else time.time()) + VAPID_LIFETIME_SECONDS),
        "sub": subject,
    }
    token = jwt.encode(claims, key, algorithm="ES256")
    return f"vapid t={token}, k={b64url_encode(public_bytes(key.public_key()))}"


@dataclass(frozen=True)
class Subscription:
    endpoint: str
    p256dh: str
    auth: str


@dataclass(frozen=True)
class Outcome:
    """`gone` means the push service no longer knows the subscription (404 or 410): delete it."""

    delivered: bool
    gone: bool
    status: int | None
    error: str | None = None


class WebPushSender:
    def __init__(self, private_key: str, subject: str, timeout: float, transport: httpx.BaseTransport | None = None):
        self.key = private_key_from(private_key)
        self.subject = subject
        self.timeout = timeout
        self.transport = transport

    @property
    def public_key(self) -> str:
        return b64url_encode(public_bytes(self.key.public_key()))

    def send(self, subscription: Subscription, payload: bytes, *, ttl: int = DEFAULT_TTL_SECONDS, urgency: str = "normal") -> Outcome:
        if not allowed_endpoint(subscription.endpoint):
            return Outcome(False, True, None, "not a push service")
        try:
            body = encrypt(payload, b64url_decode(subscription.p256dh), b64url_decode(subscription.auth))
        except ValueError as exc:
            # A malformed stored subscription can never be delivered to.
            return Outcome(False, True, None, str(exc))
        headers = {
            "Authorization": vapid_header(subscription.endpoint, self.key, self.subject),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": str(max(0, ttl)),
            "Urgency": urgency,
        }
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport) as client:
                response = client.post(subscription.endpoint, content=body, headers=headers)
        except httpx.HTTPError as exc:
            return Outcome(False, False, None, type(exc).__name__)
        if 200 <= response.status_code < 300:
            return Outcome(True, False, response.status_code)
        return Outcome(False, response.status_code in (404, 410), response.status_code, response.text[:200])
