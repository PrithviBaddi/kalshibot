"""Encrypt Kalshi API key material at rest (Fernet)."""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


class CredentialsEncryptionError(Exception):
    """Server env `KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY` is missing or not a valid Fernet key."""


def _normalize_env_key(raw: str) -> str:
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    return s


def _fernet() -> Fernet:
    raw = _normalize_env_key(os.getenv("KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY", ""))
    if not raw:
        raise CredentialsEncryptionError(
            "Missing KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY in backend/.env. "
            "This is a server encryption key (not your Kalshi API key). Generate one: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    try:
        return Fernet(raw.encode("ascii"))
    except ValueError as e:
        hint = ""
        if "BEGIN" in raw or "PRIVATE" in raw or "RSA" in raw:
            hint = " You pasted a PEM/private key into the env var; that belongs in the app Settings form only."
        raise CredentialsEncryptionError(
            "Invalid KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY — it must be a Fernet key generated on the server, "
            "not your Kalshi API Key ID or private key."
            + hint
            + " Generate: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        ) from e


def encrypt_secret(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode("utf-8"))


def decrypt_secret(blob: bytes) -> str:
    try:
        return _fernet().decrypt(blob).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Could not decrypt stored credentials (wrong KALSHIBOT_CREDENTIALS_ENCRYPTION_KEY?)") from e
