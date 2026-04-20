"""Password hashing (bcrypt). Direct `bcrypt` avoids passlib + bcrypt 4.1+ breakage on Python 3.13."""

from __future__ import annotations

import hashlib

import bcrypt

# Bcrypt ignores bytes beyond 72; hash long UTF-8 passwords first so behavior is defined.
def _password_bytes(plain: str) -> bytes:
    raw = plain.encode("utf-8")
    if len(raw) <= 72:
        return raw
    return hashlib.sha256(raw).digest()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_password_bytes(plain), bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain), hashed.encode("ascii"))
    except ValueError:
        return False
