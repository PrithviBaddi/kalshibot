"""Per-request user id for multi-tenant DB access (Stage 12)."""

from __future__ import annotations

from contextvars import ContextVar, Token

_current_user_id: ContextVar[int] = ContextVar("current_user_id", default=1)


def get_effective_user_id() -> int:
    return _current_user_id.get()


def set_effective_user_id(uid: int) -> Token[int]:
    return _current_user_id.set(uid)


def reset_effective_user_id(token: Token[int]) -> None:
    _current_user_id.reset(token)
