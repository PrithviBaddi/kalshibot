"""RSA-PSS signing for Kalshi REST and WebSocket authentication."""

import base64
import os
import re

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


def normalize_private_key_pem(pem: str) -> str:
    """
    Fix common paste/transport issues so `load_pem_private_key` succeeds.

    Kalshi users often paste PEMs from downloads or UIs where newlines become
    literal ``\\n`` or Windows CRLF; that triggers cryptography MalformedFraming.
    """
    s = pem.strip()
    if not s:
        return s
    if s.startswith("\ufeff"):
        s = s[1:].lstrip()
    # Literal backslash-newline sequences (bad JSON or copy from code)
    if "\\n" in s:
        s = s.replace("\\r\\n", "\n").replace("\\r", "\n").replace("\\n", "\n")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    # Zero-width / BOM fragments inside the body
    s = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", s)
    return s.strip() + "\n"


def _reflow_pem_body(pem: str) -> str:
    """Re-wrap the base64 block into 64-char lines (fixes some MalformedFraming cases)."""
    s = pem.strip()
    m_begin = re.search(r"-----BEGIN [^-]+-----", s)
    m_end = re.search(r"-----END [^-]+-----", s)
    if not m_begin or not m_end or m_end.start() <= m_begin.end():
        return pem
    header = m_begin.group(0)
    footer = m_end.group(0)
    body = re.sub(r"\s+", "", s[m_begin.end() : m_end.start()])
    if len(body) < 64:
        return pem
    chunks = [body[i : i + 64] for i in range(0, len(body), 64)]
    return header + "\n" + "\n".join(chunks) + "\n" + footer + "\n"


def load_private_key_from_env():
    """
    Load Kalshi RSA key for REST/WebSocket signing.

    Precedence (for PaaS like Railway where file paths are awkward):
    1. ``KALSHI_PRIVATE_KEY`` — full PEM text in the environment (Railway: paste PEM with
       literal ``\\n`` for newlines, or a single line; :func:`normalize_private_key_pem` fixes both).
    2. ``KALSHI_PRIVATE_KEY_PATH`` — path to a PEM file on disk (local dev).
    """
    pem_raw = os.getenv("KALSHI_PRIVATE_KEY")
    path = os.getenv("KALSHI_PRIVATE_KEY_PATH")
    if pem_raw and str(pem_raw).strip():
        normalized = normalize_private_key_pem(str(pem_raw))
        raw = normalized.encode("utf-8")
        try:
            return serialization.load_pem_private_key(raw, password=None, backend=default_backend())
        except Exception:
            reflowed = _reflow_pem_body(normalized)
            if reflowed != normalized:
                return serialization.load_pem_private_key(
                    reflowed.encode("utf-8"), password=None, backend=default_backend()
                )
            raise
    if path and str(path).strip():
        with open(str(path).strip(), "rb") as f:
            data = f.read()
        return serialization.load_pem_private_key(data, password=None, backend=default_backend())
    raise ValueError(
        "Set KALSHI_PRIVATE_KEY (inline PEM) or KALSHI_PRIVATE_KEY_PATH (path to .pem/.key file)"
    )


def load_private_key_from_pem_bytes(data: bytes):
    """Load RSA private key from PEM bytes (per-user credentials)."""
    text = data.decode("utf-8")
    normalized = normalize_private_key_pem(text)
    raw = normalized.encode("utf-8")
    try:
        return serialization.load_pem_private_key(raw, password=None, backend=default_backend())
    except Exception:
        reflowed = _reflow_pem_body(normalized)
        if reflowed != normalized:
            return serialization.load_pem_private_key(
                reflowed.encode("utf-8"), password=None, backend=default_backend()
            )
        raise


def private_key_pem_fingerprint_hint(pem: str) -> str:
    """Non-secret hint for logs (first line of PEM only)."""
    for line in pem.strip().splitlines():
        if line.startswith("-----"):
            return line[:72]
    return "(no PEM header)"


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
