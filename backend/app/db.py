"""Stage 7: tiny SQLite persistence layer (no extra deps)."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any


def db_path() -> str:
    # Stored in backend/ by default so it stays near the app.
    return os.getenv(
        "KALSHIBOT_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "kalshibot.db"),
    )


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(db_path())
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with connect() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS strategy (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              data_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_orders (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticker TEXT NOT NULL,
              side TEXT NOT NULL,
              price_cents INTEGER NOT NULL,
              count INTEGER NOT NULL,
              order_notional_cents INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              payload_json TEXT NOT NULL
            )
            """
        )
        con.commit()


def load_strategy() -> dict[str, Any] | None:
    with connect() as con:
        row = con.execute("SELECT data_json FROM strategy WHERE id = 1").fetchone()
        if not row:
            return None
        return json.loads(row["data_json"])


def save_strategy(data: dict[str, Any]) -> None:
    now = int(time.time())
    with connect() as con:
        con.execute(
            """
            INSERT INTO strategy (id, data_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              data_json = excluded.data_json,
              updated_at = excluded.updated_at
            """,
            (json.dumps(data), now),
        )
        con.commit()


def insert_paper_order(*, payload: dict[str, Any]) -> int:
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO paper_orders
              (ticker, side, price_cents, count, order_notional_cents, created_at, payload_json)
            VALUES
              (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["ticker"],
                payload["side"],
                int(payload["price_cents"]),
                int(payload["count"]),
                int(payload["order_notional_cents"]),
                now,
                json.dumps(payload),
            ),
        )
        con.commit()
        return int(cur.lastrowid)


def list_paper_orders(limit: int = 100) -> list[dict[str, Any]]:
    with connect() as con:
        rows = con.execute(
            "SELECT id, created_at, payload_json FROM paper_orders ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            payload = json.loads(r["payload_json"])
            payload["id"] = int(r["id"])
            payload["created_at"] = int(r["created_at"])
            out.append(payload)
        return out

