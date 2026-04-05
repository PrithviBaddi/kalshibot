"""Stage 7: tiny SQLite persistence layer (no extra deps)."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any

from app.request_context import get_effective_user_id


def db_path() -> str:
    # Stored in backend/ by default so it stays near the app.
    return os.getenv(
        "KALSHIBOT_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "kalshibot.db"),
    )


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(db_path())
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _backfill_paper_executions_from_orders(con: sqlite3.Connection) -> None:
    """One-time link: each legacy paper_orders row becomes a buy execution."""
    con.execute(
        """
        INSERT INTO paper_executions
          (ticker, side, action, price_cents, count, realized_pnl_cents, created_at, payload_json, paper_order_id)
        SELECT
          po.ticker,
          po.side,
          'buy',
          po.price_cents,
          po.count,
          NULL,
          po.created_at,
          po.payload_json,
          po.id
        FROM paper_orders po
        LEFT JOIN paper_executions ex ON ex.paper_order_id = po.id
        WHERE ex.id IS NULL
        """
    )


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

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS rules (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              enabled INTEGER NOT NULL,
              name TEXT NOT NULL,
              config_json TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS rule_runs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              rule_id INTEGER NOT NULL,
              created_at INTEGER NOT NULL,
              result_json TEXT NOT NULL
            )
            """
        )

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS paper_executions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticker TEXT NOT NULL,
              side TEXT NOT NULL,
              action TEXT NOT NULL,
              price_cents INTEGER NOT NULL,
              count INTEGER NOT NULL,
              realized_pnl_cents INTEGER,
              created_at INTEGER NOT NULL,
              payload_json TEXT NOT NULL,
              paper_order_id INTEGER UNIQUE
            )
            """
        )

        con.commit()
        _backfill_paper_executions_from_orders(con)
        con.commit()

        con.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              ticker TEXT NOT NULL,
              title TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              analysis_json TEXT NOT NULL,
              claude_enriched INTEGER NOT NULL DEFAULT 0,
              news_fetched INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        con.execute(
            "CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_created ON analysis_snapshots(created_at DESC)"
        )
        con.commit()

        _stage12_schema_migrate(con)
        con.commit()


def _table_columns(con: sqlite3.Connection, table: str) -> set[str]:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return {str(r[1]) for r in rows}


def _stage12_schema_migrate(con: sqlite3.Connection) -> None:
    """Stage 12: users, per-user Kalshi credentials, user_id on tenant tables."""
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          stripe_customer_id TEXT,
          stripe_subscription_id TEXT,
          plan TEXT NOT NULL DEFAULT 'free',
          subscription_status TEXT NOT NULL DEFAULT 'none'
        )
        """
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS user_kalshi_credentials (
          user_id INTEGER PRIMARY KEY,
          api_key_id_enc BLOB NOT NULL,
          private_key_enc BLOB NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )

    cols = _table_columns(con, "strategy")
    if cols and "user_id" not in cols and "id" in cols:
        con.execute(
            """
            CREATE TABLE strategy_u (
              user_id INTEGER PRIMARY KEY NOT NULL,
              data_json TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )
        con.execute(
            """
            INSERT INTO strategy_u (user_id, data_json, updated_at)
            SELECT 1, data_json, updated_at FROM strategy WHERE id = 1
            """
        )
        con.execute("DROP TABLE strategy")
        con.execute("ALTER TABLE strategy_u RENAME TO strategy")

    def _add_uid(table: str) -> None:
        c = _table_columns(con, table)
        if not c or "user_id" in c:
            return
        con.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")

    for t in ("rules", "paper_orders", "paper_executions", "analysis_snapshots", "rule_runs"):
        _add_uid(t)

    if "user_id" in _table_columns(con, "rule_runs"):
        con.execute(
            """
            UPDATE rule_runs
            SET user_id = COALESCE(
              (SELECT r.user_id FROM rules r WHERE r.id = rule_runs.rule_id),
              1
            )
            """
        )

    for idx, ddl in (
        ("idx_rules_user", "CREATE INDEX IF NOT EXISTS idx_rules_user ON rules(user_id)"),
        ("idx_paper_orders_user", "CREATE INDEX IF NOT EXISTS idx_paper_orders_user ON paper_orders(user_id)"),
        ("idx_analysis_user", "CREATE INDEX IF NOT EXISTS idx_analysis_user ON analysis_snapshots(user_id)"),
    ):
        try:
            con.execute(ddl)
        except sqlite3.OperationalError:
            pass


def _trim_analysis_for_storage(analysis: dict[str, Any]) -> str:
    slim: dict[str, Any] = json.loads(json.dumps(analysis))
    cl = slim.get("claude")
    if isinstance(cl, dict) and "raw_excerpt" in cl:
        cl["raw_excerpt"] = str(cl["raw_excerpt"])[:240]
    news = slim.get("news")
    if isinstance(news, dict) and isinstance(news.get("headlines"), list):
        for h in news["headlines"]:
            if isinstance(h, dict) and "title" in h:
                h["title"] = str(h["title"])[:320]
    return json.dumps(slim)


def insert_analysis_snapshot(
    *,
    ticker: str,
    title: str,
    analysis: dict[str, Any],
    claude_enriched: bool,
    news_fetched: bool,
) -> int:
    """Persist one analysis result; prunes oldest rows beyond cap."""
    uid = get_effective_user_id()
    now = int(time.time())
    payload = _trim_analysis_for_storage(analysis)
    max_rows = int(os.getenv("KALSHIBOT_ANALYSIS_SNAPSHOT_MAX", "500"))
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO analysis_snapshots
              (ticker, title, created_at, analysis_json, claude_enriched, news_fetched, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ticker[:512],
                (title or "")[:2000],
                now,
                payload,
                1 if claude_enriched else 0,
                1 if news_fetched else 0,
                uid,
            ),
        )
        new_id = int(cur.lastrowid)
        row = con.execute(
            "SELECT COUNT(*) AS n FROM analysis_snapshots WHERE user_id = ?",
            (uid,),
        ).fetchone()
        n = int(row["n"]) if row else 0
        if n > max_rows:
            excess = n - max_rows
            con.execute(
                """
                DELETE FROM analysis_snapshots WHERE id IN (
                  SELECT id FROM analysis_snapshots WHERE user_id = ? ORDER BY created_at ASC LIMIT ?
                )
                """,
                (uid, excess),
            )
        con.commit()
        return new_id


def list_analysis_snapshots(limit: int = 50) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 200))
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            """
            SELECT id, ticker, title, created_at, analysis_json, claude_enriched, news_fetched
            FROM analysis_snapshots
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            try:
                parsed = json.loads(r["analysis_json"])
            except json.JSONDecodeError:
                parsed = {}
            out.append(
                {
                    "id": int(r["id"]),
                    "ticker": r["ticker"],
                    "title": r["title"],
                    "created_at": int(r["created_at"]),
                    "analysis": parsed,
                    "claude_enriched": bool(r["claude_enriched"]),
                    "news_fetched": bool(r["news_fetched"]),
                }
            )
        return out


def load_strategy() -> dict[str, Any] | None:
    uid = get_effective_user_id()
    with connect() as con:
        row = con.execute(
            "SELECT data_json FROM strategy WHERE user_id = ?",
            (uid,),
        ).fetchone()
        if not row:
            return None
        return json.loads(row["data_json"])


def save_strategy(data: dict[str, Any]) -> None:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        con.execute(
            """
            INSERT INTO strategy (user_id, data_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              data_json = excluded.data_json,
              updated_at = excluded.updated_at
            """,
            (uid, json.dumps(data), now),
        )
        con.commit()


def insert_paper_order(*, payload: dict[str, Any]) -> int:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO paper_orders
              (ticker, side, price_cents, count, order_notional_cents, created_at, payload_json, user_id)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["ticker"],
                payload["side"],
                int(payload["price_cents"]),
                int(payload["count"]),
                int(payload["order_notional_cents"]),
                now,
                json.dumps(payload),
                uid,
            ),
        )
        oid = int(cur.lastrowid)
        # Mirror into the paper ledger (buy) for position / sell / realized P&L tracking.
        con.execute(
            """
            INSERT INTO paper_executions
              (ticker, side, action, price_cents, count, realized_pnl_cents, created_at, payload_json, paper_order_id, user_id)
              VALUES (?, ?, 'buy', ?, ?, NULL, ?, ?, ?, ?)
            """,
            (
                payload["ticker"],
                payload["side"],
                int(payload["price_cents"]),
                int(payload["count"]),
                now,
                json.dumps({**payload, "paper_order_id": oid}),
                oid,
                uid,
            ),
        )
        con.commit()
        return oid


def list_paper_orders(limit: int = 100) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            "SELECT id, created_at, payload_json FROM paper_orders WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            payload = json.loads(r["payload_json"])
            payload["id"] = int(r["id"])
            payload["created_at"] = int(r["created_at"])
            out.append(payload)
        return out


def list_rules(limit: int = 100) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            "SELECT id, enabled, name, config_json, created_at, updated_at FROM rules WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "enabled": bool(r["enabled"]),
                    "name": r["name"],
                    "config": json.loads(r["config_json"]),
                    "created_at": int(r["created_at"]),
                    "updated_at": int(r["updated_at"]),
                }
            )
        return out


def list_enabled_rules(limit: int = 100) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            """
            SELECT id, enabled, name, config_json, created_at, updated_at
            FROM rules
            WHERE enabled = 1 AND user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "enabled": bool(r["enabled"]),
                    "name": r["name"],
                    "config": json.loads(r["config_json"]),
                    "created_at": int(r["created_at"]),
                    "updated_at": int(r["updated_at"]),
                }
            )
        return out


def get_rule(rule_id: int) -> dict[str, Any] | None:
    uid = get_effective_user_id()
    with connect() as con:
        row = con.execute(
            "SELECT id, enabled, name, config_json, created_at, updated_at FROM rules WHERE id = ? AND user_id = ?",
            (rule_id, uid),
        ).fetchone()
        if not row:
            return None
        return {
            "id": int(row["id"]),
            "enabled": bool(row["enabled"]),
            "name": row["name"],
            "config": json.loads(row["config_json"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }


def count_rule_runs(rule_id: int) -> int:
    uid = get_effective_user_id()
    with connect() as con:
        row = con.execute(
            "SELECT COUNT(*) as n FROM rule_runs WHERE rule_id = ? AND user_id = ?",
            (rule_id, uid),
        ).fetchone()
        return int(row["n"] if row else 0)


def list_rule_runs(limit: int = 100) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            """
            SELECT id, rule_id, created_at, result_json
            FROM rule_runs
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "rule_id": int(r["rule_id"]),
                    "created_at": int(r["created_at"]),
                    "result": json.loads(r["result_json"]),
                }
            )
        return out


def list_rule_runs_for_rule(rule_id: int, limit: int = 100) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            """
            SELECT id, rule_id, created_at, result_json
            FROM rule_runs
            WHERE rule_id = ? AND user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (rule_id, uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "rule_id": int(r["rule_id"]),
                    "created_at": int(r["created_at"]),
                    "result": json.loads(r["result_json"]),
                }
            )
        return out


def create_rule(*, enabled: bool, name: str, config: dict[str, Any]) -> int:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO rules (enabled, name, config_json, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (1 if enabled else 0, name, json.dumps(config), now, now, uid),
        )
        con.commit()
        return int(cur.lastrowid)


def update_rule(
    rule_id: int, *, enabled: bool, name: str, config: dict[str, Any]
) -> None:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        con.execute(
            """
            UPDATE rules
            SET enabled = ?, name = ?, config_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (1 if enabled else 0, name, json.dumps(config), now, rule_id, uid),
        )
        con.commit()


def insert_rule_run(*, rule_id: int, result: dict[str, Any]) -> int:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO rule_runs (rule_id, created_at, result_json, user_id)
            VALUES (?, ?, ?, ?)
            """,
            (rule_id, now, json.dumps(result), uid),
        )
        con.commit()
        return int(cur.lastrowid)


def list_paper_executions_ordered(limit: int = 50_000) -> list[dict[str, Any]]:
    uid = get_effective_user_id()
    with connect() as con:
        rows = con.execute(
            """
            SELECT id, ticker, side, action, price_cents, count, realized_pnl_cents, created_at, payload_json, paper_order_id
            FROM paper_executions
            WHERE user_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (uid, limit),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": int(r["id"]),
                    "ticker": r["ticker"],
                    "side": r["side"],
                    "action": r["action"],
                    "price_cents": int(r["price_cents"]),
                    "count": int(r["count"]),
                    "realized_pnl_cents": int(r["realized_pnl_cents"])
                    if r["realized_pnl_cents"] is not None
                    else None,
                    "created_at": int(r["created_at"]),
                    "payload": json.loads(r["payload_json"]),
                    "paper_order_id": int(r["paper_order_id"]) if r["paper_order_id"] is not None else None,
                }
            )
        return out


def insert_paper_sell(*, payload: dict[str, Any], realized_pnl_cents: int) -> int:
    uid = get_effective_user_id()
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO paper_executions
              (ticker, side, action, price_cents, count, realized_pnl_cents, created_at, payload_json, paper_order_id, user_id)
              VALUES (?, ?, 'sell', ?, ?, ?, ?, ?, NULL, ?)
            """,
            (
                payload["ticker"],
                payload["side"],
                int(payload["price_cents"]),
                int(payload["count"]),
                int(realized_pnl_cents),
                now,
                json.dumps(payload),
                uid,
            ),
        )
        con.commit()
        return int(cur.lastrowid)


def total_realized_pnl_cents() -> int:
    uid = get_effective_user_id()
    with connect() as con:
        row = con.execute(
            """
            SELECT COALESCE(SUM(realized_pnl_cents), 0) AS s
            FROM paper_executions
            WHERE action = 'sell' AND realized_pnl_cents IS NOT NULL AND user_id = ?
            """,
            (uid,),
        ).fetchone()
        return int(row["s"] if row else 0)


# --- Stage 12: accounts ---


def create_user(*, email: str, password_hash: str) -> int:
    now = int(time.time())
    with connect() as con:
        cur = con.execute(
            """
            INSERT INTO users (email, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (email.strip().lower(), password_hash, now),
        )
        con.commit()
        return int(cur.lastrowid)


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with connect() as con:
        row = con.execute(
            "SELECT id, email, password_hash, created_at, stripe_customer_id, stripe_subscription_id, plan, subscription_status FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip().lower(),),
        ).fetchone()
        if not row:
            return None
        return dict(row)


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with connect() as con:
        row = con.execute(
            "SELECT id, email, password_hash, created_at, stripe_customer_id, stripe_subscription_id, plan, subscription_status FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return dict(row)


def update_user_stripe_ids(
    user_id: int,
    *,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> None:
    with connect() as con:
        if stripe_customer_id is not None:
            con.execute(
                "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
                (stripe_customer_id, user_id),
            )
        if stripe_subscription_id is not None:
            con.execute(
                "UPDATE users SET stripe_subscription_id = ? WHERE id = ?",
                (stripe_subscription_id, user_id),
            )
        con.commit()


def update_user_plan(user_id: int, *, plan: str, subscription_status: str) -> None:
    with connect() as con:
        con.execute(
            "UPDATE users SET plan = ?, subscription_status = ? WHERE id = ?",
            (plan, subscription_status, user_id),
        )
        con.commit()


def save_user_kalshi_credentials(*, user_id: int, api_key_id: str, private_key_pem: str) -> None:
    from app.credentials_crypto import encrypt_secret

    now = int(time.time())
    blob_id = encrypt_secret(api_key_id.strip())
    blob_pem = encrypt_secret(private_key_pem.strip())
    with connect() as con:
        con.execute(
            """
            INSERT INTO user_kalshi_credentials (user_id, api_key_id_enc, private_key_enc, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              api_key_id_enc = excluded.api_key_id_enc,
              private_key_enc = excluded.private_key_enc,
              updated_at = excluded.updated_at
            """,
            (user_id, blob_id, blob_pem, now),
        )
        con.commit()


def load_user_kalshi_credentials(user_id: int) -> tuple[str, str] | None:
    from app.credentials_crypto import decrypt_secret

    with connect() as con:
        row = con.execute(
            "SELECT api_key_id_enc, private_key_enc FROM user_kalshi_credentials WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return (
            decrypt_secret(row["api_key_id_enc"]),
            decrypt_secret(row["private_key_enc"]),
        )


def list_user_ids_with_enabled_rules() -> list[int]:
    """Background jobs: one row per user that has at least one enabled rule."""
    with connect() as con:
        rows = con.execute(
            """
            SELECT DISTINCT user_id FROM rules WHERE enabled = 1 ORDER BY user_id
            """
        ).fetchall()
        return [int(r["user_id"]) for r in rows]

