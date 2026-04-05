"""Encrypt Kalshi API key material at rest (Fernet)."""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


def _fernet() -> Fernet:
    raw = os.getenv("KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise ValueError(
            "Set KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY to a Fernet key "
            "(run: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\")"
        )
    return Fernet(raw.encode() if isinstance(raw, str) else raw)


def encrypt_secret(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_secret(blob: bytes) -> str:
    try:
        return _fernet().decrypt(blob).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Could not decrypt stored credentials (wrong KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY?)") from e
