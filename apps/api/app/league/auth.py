"""Supabase access token verification (plan section 4).

Signature, issuer, audience and expiry are always checked. Projects with asymmetric
signing keys are verified against the project's JWKS endpoint (PyJWKClient caches keys
and follows rotation); projects still on the legacy shared secret verify with HS256 when
SUPABASE_JWT_SECRET is configured. A decoded token is never trusted without one of these.
"""

from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

import jwt
from jwt import PyJWKClient

ASYMMETRIC_ALGORITHMS = ["ES256", "RS256"]


class TokenError(Exception):
    """The token is missing, malformed, expired or signed by someone else."""


@dataclass(frozen=True)
class Claims:
    subject: UUID
    email: str | None
    email_verified: bool


class TokenVerifier(Protocol):
    def verify(self, token: str) -> Claims: ...


def _claims(payload: dict[str, Any]) -> Claims:
    try:
        subject = UUID(str(payload["sub"]))
    except (KeyError, ValueError) as exc:
        raise TokenError("Token has no usable subject.") from exc
    email = payload.get("email")
    metadata = payload.get("user_metadata") or {}
    # Supabase sets email_verified in user_metadata for OAuth sign-ins; email/password
    # accounts cannot sign in before confirmation when confirmations are on.
    verified = metadata.get("email_verified")
    return Claims(
        subject=subject,
        email=email.strip().lower() if isinstance(email, str) and email.strip() else None,
        email_verified=verified is not False,
    )


class JwksVerifier:
    def __init__(self, supabase_url: str, audience: str) -> None:
        base = supabase_url.rstrip("/")
        self._issuer = f"{base}/auth/v1"
        self._audience = audience
        self._client = PyJWKClient(f"{base}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600)

    def verify(self, token: str) -> Claims:
        try:
            key = self._client.get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token, key, algorithms=ASYMMETRIC_ALGORITHMS, audience=self._audience, issuer=self._issuer
            )
        except jwt.PyJWTError as exc:
            raise TokenError(str(exc)) from exc
        return _claims(payload)


class SecretVerifier:
    """Legacy HS256 verification with the project's JWT secret."""

    def __init__(self, supabase_url: str, audience: str, secret: str) -> None:
        self._issuer = f"{supabase_url.rstrip('/')}/auth/v1"
        self._audience = audience
        self._secret = secret

    def verify(self, token: str) -> Claims:
        try:
            payload = jwt.decode(
                token, self._secret, algorithms=["HS256"], audience=self._audience, issuer=self._issuer
            )
        except jwt.PyJWTError as exc:
            raise TokenError(str(exc)) from exc
        return _claims(payload)


class UnconfiguredVerifier:
    def verify(self, token: str) -> Claims:
        raise TokenError("Authentication is not configured.")
