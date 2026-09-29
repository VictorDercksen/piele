"""Prints a new VAPID key pair: `uv run python -m app.push.keys`.

Set the private key as PIELE_VAPID_PRIVATE_KEY (sensitive) on the API. The public key is
shown for reference only: the API derives it and serves it at GET /v1/push/key. Replacing
the private key invalidates every browser subscription, so members turn push on again.
"""

from cryptography.hazmat.primitives.asymmetric import ec

from app.push.webpush import b64url_encode, public_bytes


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    print(f"PIELE_VAPID_PRIVATE_KEY={b64url_encode(private)}")
    print(f"Public key: {b64url_encode(public_bytes(key.public_key()))}")


if __name__ == "__main__":
    main()
