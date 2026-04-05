"""RSA-PSS signing for Kalshi REST and WebSocket authentication."""

import base64
import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


def load_private_key_from_env():
    path = os.getenv("KALSHI_PRIVATE_KEY_PATH")
    pem = os.getenv("KALSHI_PRIVATE_KEY")
    if path:
        with open(path, "rb") as f:
            data = f.read()
    elif pem:
        data = pem.encode() if isinstance(pem, str) else pem
    else:
        raise ValueError(
            "Set KALSHI_PRIVATE_KEY_PATH (path to .key file) or KALSHI_PRIVATE_KEY (PEM string)"
        )
    return serialization.load_pem_private_key(data, password=None, backend=default_backend())


def load_private_key_from_pem_bytes(data: bytes):
    """Load RSA private key from PEM bytes (per-user credentials)."""
    return serialization.load_pem_private_key(data, password=None, backend=default_backend())


def sign_pss_text(private_key, timestamp: str, method: str, path: str) -> str:
    path_without_query = path.split("?")[0]
    message = f"{timestamp}{method}{path_without_query}".encode("utf-8")
    signature = private_key.sign(
        message,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.DIGEST_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")
