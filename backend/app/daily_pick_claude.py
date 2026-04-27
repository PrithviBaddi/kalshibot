"""
Daily pick — Claude analyst with native tool use (web, Kalshi, FRED, BLS), JSON output, PASS rules.

Model for this path: claude-sonnet-4-6 (override with ANTHROPIC_MODEL_DAILY_PICK only).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from app.claude_enrichment import _extract_json_object
from app.daily_pick_context import _economic_release_data_block, fetch_kalshi_seven_day_trend_sentence
from app.fred_data import fetch_fred_economic_context
from app.scanner import summarize_market
from kalshi.client import KalshiClient

logger = logging.getLogger(__name__)

DAILY_PICK_MODEL_DEFAULT = "claude-sonnet-4-6"

DAILY_PICK_TOOLS: list[dict[str, Any]] = [
    {
        "name": "web_search",
        "description": (
            "Search the public web for recent news or context. "
            "Prefer queries tied to the market title, ticker, or resolution criteria. "
            "Returns up to 5 results (title, URL, snippet)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query string.",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_kalshi_market",
        "description": "Fetch current Kalshi order book and metadata for a contract by ticker.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Kalshi market ticker."},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_kalshi_price_history",
        "description": "Summarize roughly 7-day YES price trend from Kalshi candles or fallbacks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Kalshi market ticker."},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_economic_data",
        "description": (
            "Latest US macro snapshot from FRED: Fed funds rate, CPI YoY, unemployment, real GDP YoY. "
            "No API key returns an error stub."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_bls_release_data",
        "description": (
            "For supported economic-release contracts, fetch a direct BLS series value "
            "(e.g. retail sales RSXFS, payrolls for ADP-style markets)."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

TOOL_SOURCE_TAGS: dict[str, str] = {
    "web_search": "claude_used_web_search",
    "get_kalshi_market": "claude_used_kalshi_market",
    "get_kalshi_price_history": "claude_used_kalshi_price_history",
    "get_economic_data": "claude_used_get_economic_data",
    "get_bls_release_data": "claude_used_get_bls_release_data",
}

DAILY_PICK_SYSTEM_PROMPT = """You are an analyst helping readers understand one Kalshi prediction market for a daily email–style pick.

You have tools: web_search, get_kalshi_market, get_kalshi_price_history, get_economic_data (FRED macro: fed funds, CPI, unemployment, GDP), and get_bls_release_data (direct BLS values for supported release-style contracts). Use them during your reasoning — you are not given a pre-built news or macro briefing.

Rules:
- Before your final answer, you MUST call web_search at least once with a query that is clearly relevant to this market or its resolution (recent news, official schedules, or key facts). If the first search is weak, run another query.
- Use get_kalshi_market / get_kalshi_price_history when pricing or momentum matters.
- Use get_economic_data and/or get_bls_release_data when the question is macro or an official economic statistic.

You only rely on tool outputs plus the market text and Kalshi-implied YES we give you (and the short internal historical note in the user message). You do not have insider information.

Your job:
1. Restate the Kalshi-implied probability of YES clearly (use the number we give you).
2. Give your own estimate of the real-world probability that YES happens, using tool-grounded evidence when relevant and general reasoning when helpful.
3. In plain English, explain the gap between Kalshi’s view and yours.
4. Give a confidence score from 1 to 100 based on how much solid, relevant evidence you have—not trading confidence, not “gut feel.”
5. Compute edge = (your estimated P(YES)) minus (Kalshi-implied P(YES)), as decimals between 0 and 1.

Output rules (final turn only — after you are done calling tools):
- Respond with a single JSON object only. No markdown, no code fences, no text before or after the JSON.
- Required keys and types:
  - "model_yes_probability": number between 0.02 and 0.98 (your P(YES))
  - "confidence_score": integer from 1 to 100
  - "reasoning": string, maximum 3 short sentences, plain English, no jargon (no "spread", "liquidity", "order book", "edge" as a finance term—plain words only)
  - "recommended_action": exactly one of "BUY_YES", "BUY_NO", "PASS"
  - "edge": number, your model_yes_probability minus Kalshi implied YES (same units as probabilities, typically between -1 and 1)

Recommendation rule (we also enforce this in software):
- If the absolute gap is smaller than 0.10 (10 percentage points), set recommended_action to "PASS" — tiny edge is never worth acting on.
- If |edge| ≥ 0.40 and confidence_score ≥ 40, a BUY_YES or BUY_NO may stand (large disagreement with moderate+ confidence).
- If |edge| ≥ 0.20 and confidence_score ≥ 50, a BUY_YES or BUY_NO may stand.
- If 0.10 ≤ |edge| < 0.20, we still require confidence_score ≥ 60 to act; otherwise PASS.
- Otherwise set recommended_action to "PASS".

This is educational context only, not financial advice."""


def build_agentic_daily_pick_user_message(
    *,
    ticker: str,
    title: str,
    implied_decimal: float,
    historical_lines: list[str] | None,
) -> str:
    pct = implied_decimal * 100.0
    lines = historical_lines or []
    if lines:
        hist = "\n".join(f"- {ln}" for ln in lines)
    else:
        hist = "- No closely related resolved picks in our database."
    return f"""Kalshi contract ticker: {ticker}

Question (exact contract text):
{title}

Kalshi-implied probability of YES (from mid): {pct:.1f}%  (decimal {implied_decimal:.6f})

### Our historical context (similar past picks — internal DB only)
{hist}

Use your tools to research this market. You must call web_search at least once with a relevant query before the final JSON.

When ready, output only the JSON object with keys: model_yes_probability, confidence_score, reasoning, recommended_action, edge (edge = model_yes_probability − {implied_decimal:.6f})."""


def _normalize_recommended_action(raw: str) -> str:
    s = (raw or "").upper().strip().replace(" ", "_").replace("-", "_")
    if s in ("BUY_YES", "BUY_NO", "PASS"):
        return s
    if "PASS" in s:
        return "PASS"
    if "YES" in s and "BUY" in s:
        return "BUY_YES"
    if "NO" in s and "BUY" in s:
        return "BUY_NO"
    return "PASS"


def apply_daily_pick_pass_rules(parsed: dict[str, Any]) -> dict[str, Any]:
    """
    Final authority for actionable recommendations:
    - Always PASS if |edge| <= 0.09.
    - If |edge| >= 0.40: allow BUY_YES/BUY_NO when confidence_score >= 40.
    - Elif |edge| >= 0.20: allow when confidence_score >= 50.
    - Elif |edge| >= 0.10: allow only when confidence_score >= 60 (marginal edge).
    """
    edge = float(parsed.get("edge", 0.0))
    cs = int(parsed.get("confidence_score", 0))
    ra = _normalize_recommended_action(str(parsed.get("recommended_action", "PASS")))
    ae = abs(edge)

    if ae <= 0.09:
        ra = "PASS"
    elif ae >= 0.40:
        if cs < 40:
            ra = "PASS"
    elif ae >= 0.20:
        if cs < 50:
            ra = "PASS"
    else:
        if cs < 60:
            ra = "PASS"

    out = dict(parsed)
    out["edge"] = round(edge, 6)
    out["confidence_score"] = max(1, min(100, cs))
    out["recommended_action"] = ra
    return out


def parse_daily_pick_claude_json(obj: dict[str, Any], *, implied_decimal: float) -> dict[str, Any] | None:
    """Validate and normalize Claude output; recompute edge = model_yes - implied."""
    try:
        my = float(obj.get("model_yes_probability", implied_decimal))
    except (TypeError, ValueError):
        return None
    my = max(0.02, min(0.98, my))

    cs_raw = obj.get("confidence_score", 60)
    try:
        cs = int(float(cs_raw))
    except (TypeError, ValueError):
        cs = 60
    if 0 < cs <= 1:
        cs = int(cs * 100)
    cs = max(1, min(100, cs))

    reasoning = str(obj.get("reasoning", ""))[:2000].strip()
    if not reasoning:
        return None

    edge = my - float(implied_decimal)
    if "edge" in obj and obj.get("edge") is not None:
        try:
            edge = float(obj.get("edge"))
        except (TypeError, ValueError):
            edge = my - float(implied_decimal)

    ra = _normalize_recommended_action(str(obj.get("recommended_action", "PASS")))

    return {
        "model_yes_probability": round(my, 4),
        "confidence_score": cs,
        "reasoning": reasoning,
        "recommended_action": ra,
        "edge": round(edge, 6),
    }


def _confidence_label_from_score(score: int) -> str:
    if score >= 65:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def _extract_text_blocks(content: list[Any]) -> str:
    parts: list[str] = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            parts.append(str(b.get("text") or ""))
    return "".join(parts).strip()


def _extract_json_with_key(raw_text: str, required_key: str = "model_yes_probability") -> dict[str, Any] | None:
    """
    Robustly extract one JSON object containing `required_key` from mixed text.
    Tries:
    1) existing helper
    2) fenced ```json blocks
    3) brace-balanced scan over all `{...}` candidates
    """
    txt = (raw_text or "").strip()
    if not txt:
        return None

    first_try = _extract_json_object(txt)
    if isinstance(first_try, dict) and required_key in first_try:
        return first_try

    for m in re.finditer(r"```(?:json)?\s*([\s\S]*?)```", txt, flags=re.IGNORECASE):
        inner = (m.group(1) or "").strip()
        obj = _extract_json_object(inner)
        if isinstance(obj, dict) and required_key in obj:
            return obj

    starts = [i for i, ch in enumerate(txt) if ch == "{"]
    for s in starts:
        depth = 0
        in_str = False
        esc = False
        for i in range(s, len(txt)):
            ch = txt[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = txt[s : i + 1]
                    try:
                        obj = json.loads(candidate)
                    except Exception:
                        break
                    if isinstance(obj, dict) and required_key in obj:
                        return obj
                    break
    return None


def _html_to_plain_text(html: str) -> str:
    s = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html or "")
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


async def _brave_search_results(query: str) -> list[dict[str, str]] | None:
    key = os.getenv("BRAVE_API_KEY", "").strip()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0)) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 5},
                headers={
                    "X-Subscription-Token": key,
                    "Accept": "application/json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as e:
        logger.warning("Brave web search failed query=%r err=%s", query[:120], e)
        return None

    web = data.get("web") if isinstance(data, dict) else None
    raw_list = web.get("results") if isinstance(web, dict) else None
    if not isinstance(raw_list, list):
        return None
    out: list[dict[str, str]] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        snippet = str(item.get("description") or item.get("snippet") or "").strip()
        if not title and not snippet:
            continue
        out.append(
            {
                "title": (title or url or "Result")[:500],
                "url": url[:2000],
                "snippet": snippet[:1200],
            }
        )
        if len(out) >= 5:
            break
    return out or None


async def _serper_search_results(query: str) -> list[dict[str, str]] | None:
    key = os.getenv("SERPER_API_KEY", "").strip()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0)) as client:
            resp = await client.post(
                "https://google.serper.dev/search",
                headers={
                    "X-API-KEY": key,
                    "content-type": "application/json",
                },
                json={"q": query, "num": 5},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as e:
        logger.warning("Serper search failed query=%r err=%s", query[:120], e)
        return None
    organic = data.get("organic") if isinstance(data, dict) else None
    if not isinstance(organic, list):
        return None
    out: list[dict[str, str]] = []
    for item in organic:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("link") or "").strip()
        snippet = str(item.get("snippet") or "").strip()
        if not title and not snippet:
            continue
        out.append(
            {
                "title": (title or url or "Result")[:500],
                "url": url[:2000],
                "snippet": snippet[:1200],
            }
        )
        if len(out) >= 5:
            break
    if out:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
            for i, item in enumerate(out[:2]):
                url = str(item.get("url") or "").strip()
                if not url:
                    continue
                try:
                    resp = await client.get(url, follow_redirects=True)
                    resp.raise_for_status()
                    plain = _html_to_plain_text(resp.text or "")
                    if plain:
                        item["full_text"] = plain[:500]
                except Exception as e:
                    logger.info("Serper full-text fetch skipped url=%r err=%s", url[:240], e)
    return out or None


async def _tavily_search_results(query: str) -> list[dict[str, str]] | None:
    key = os.getenv("TAVILY_API_KEY", "").strip()
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0)) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": query, "max_results": 5},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as e:
        logger.warning("Tavily search failed query=%r err=%s", query[:120], e)
        return None
    raw = data.get("results") if isinstance(data, dict) else None
    if not isinstance(raw, list):
        return None
    out: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        snippet = str(item.get("content") or "").strip()
        if not title and not snippet:
            continue
        out.append(
            {
                "title": (title or url or "Result")[:500],
                "url": url[:2000],
                "snippet": snippet[:1200],
            }
        )
        if len(out) >= 5:
            break
    return out or None


async def _web_search_for_tool(query: str) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {"provider": "none", "results": [], "error": "empty_query"}
    brave = await _brave_search_results(q)
    if brave:
        return {"provider": "brave", "results": brave}
    serper = await _serper_search_results(q)
    if serper:
        return {"provider": "serper", "results": serper}
    tavily = await _tavily_search_results(q)
    if tavily:
        return {"provider": "tavily", "results": tavily}
    logger.warning(
        "web_search tool returned empty results: no provider configured or all provider calls failed "
        "(set BRAVE_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY)"
    )
    return {"provider": "none", "results": [], "error": "no_search_provider_configured_or_available"}


async def _anthropic_post_messages(
    *,
    model: str,
    system: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    max_tokens: int,
    tool_choice: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    if tools is not None:
        payload["tools"] = tools
    if tool_choice is not None:
        payload["tool_choice"] = tool_choice
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        body = (e.response.text or "")[:800]
        logger.warning("Anthropic messages HTTP status=%s body=%s", e.response.status_code, body)
        return None
    except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
        logger.warning("Anthropic messages failed: %s", e)
        return None


async def _run_daily_pick_tool(
    name: str,
    tool_input: dict[str, Any],
    *,
    k: KalshiClient,
    bound_ticker: str,
    bound_title: str,
    tool_state: dict[str, Any],
    tool_log: list[dict[str, Any]],
) -> Any:
    if name == "web_search":
        q = str(tool_input.get("query") or "").strip()
        payload = await _web_search_for_tool(q)
        tool_state["web_search_used"] = True
        for r in payload.get("results") or []:
            if isinstance(r, dict) and r.get("title"):
                tool_state.setdefault("web_headlines", []).append(
                    {
                        "title": str(r.get("title") or "")[:500],
                        "source": str(payload.get("provider") or "web"),
                        "url": str(r.get("url") or "")[:2000],
                    }
                )
        tool_log.append({"name": name, "input": {"query": q}, "result_preview": str(payload)[:2000]})
        return payload

    if name == "get_kalshi_market":
        t = str(tool_input.get("ticker") or bound_ticker).strip()
        try:
            data = await k.get_market(t)
        except httpx.HTTPError as e:
            tool_log.append({"name": name, "input": {"ticker": t}, "error": str(e)})
            return {"error": str(e), "ticker": t}
        m = data.get("market") if isinstance(data, dict) else None
        if not isinstance(m, dict):
            m = data if isinstance(data, dict) else {}
        s = summarize_market(m)
        tool_state["kalshi_market_snapshot"] = s
        out = {
            "ticker": t,
            "yes_bid": s.get("yes_bid"),
            "yes_ask": s.get("yes_ask"),
            "mid_probability": s.get("mid_prob"),
            "volume": s.get("volume"),
            "spread": s.get("spread"),
            "close_time": s.get("close_time"),
        }
        tool_log.append({"name": name, "input": {"ticker": t}, "result_preview": json.dumps(out)[:1500]})
        return out

    if name == "get_kalshi_price_history":
        t = str(tool_input.get("ticker") or bound_ticker).strip()
        m: dict[str, Any] = {"ticker": t}
        try:
            data = await k.get_market(t)
        except httpx.HTTPError:
            data = {}
        if isinstance(data, dict):
            inner = data.get("market")
            if isinstance(inner, dict):
                m = inner
            elif data.get("ticker"):
                m = data
        sentence, ok = await fetch_kalshi_seven_day_trend_sentence(k, m)
        tool_state["price_trend_summary"] = sentence
        tool_state["price_trend_ok"] = ok
        tool_log.append({"name": name, "input": {"ticker": t}, "result_preview": sentence[:1500]})
        return {"ticker": t, "trend_summary": sentence, "derived_from_history": ok}

    if name == "get_economic_data":
        block = await fetch_fred_economic_context()
        tool_state["fred_macro"] = block
        tool_log.append({"name": name, "input": {}, "result_preview": str(block.get("paragraph") or "")[:1500]})
        return block

    if name == "get_bls_release_data":
        block = await _economic_release_data_block(bound_ticker, bound_title)
        tool_state["bls_release"] = block
        tool_log.append({"name": name, "input": {}, "result_preview": str(block.get("paragraph") or "")[:1500]})
        return block

    tool_log.append({"name": name, "error": "unknown_tool"})
    return {"error": f"unknown_tool:{name}"}


async def _daily_pick_agentic_loop(
    *,
    model_id: str,
    initial_user: str,
    k: KalshiClient,
    bound_ticker: str,
    bound_title: str,
    max_tool_rounds: int = 5,
) -> tuple[str | None, list[str], dict[str, Any]]:
    """
    Run Anthropic messages with tools. Up to `max_tool_rounds` rounds where the assistant
    requests tools; after that, `tool_choice: none` forces a text-only JSON answer.
    Returns (final assistant text, ordered source tags, diagnostics dict).
    """
    messages: list[dict[str, Any]] = [{"role": "user", "content": initial_user}]
    source_tags_ordered: list[str] = []
    seen: set[str] = set()
    tool_state: dict[str, Any] = {"web_search_used": False, "web_headlines": []}
    tool_log: list[dict[str, Any]] = []
    tool_rounds = 0
    final_text: str | None = None
    web_nudge_count = 0
    final_json_nudge_count = 0
    safety = 0

    def _note_tag(tool_name: str) -> None:
        tag = TOOL_SOURCE_TAGS.get(tool_name)
        if tag and tag not in seen:
            seen.add(tag)
            source_tags_ordered.append(tag)

    while safety < 24:
        safety += 1
        allow_tools = tool_rounds < max_tool_rounds
        tool_choice: dict[str, Any] | None = None if allow_tools else {"type": "none"}
        logger.info(
            "Daily pick Claude loop tick=%d tool_rounds=%d allow_tools=%s tool_choice=%s",
            safety,
            tool_rounds,
            allow_tools,
            tool_choice.get("type") if isinstance(tool_choice, dict) else "auto",
        )

        data = await _anthropic_post_messages(
            model=model_id,
            system=DAILY_PICK_SYSTEM_PROMPT,
            messages=messages,
            tools=DAILY_PICK_TOOLS,
            max_tokens=4096,
            tool_choice=tool_choice,
        )
        if not isinstance(data, dict):
            break

        stop_reason = str(data.get("stop_reason") or "")
        content = data.get("content")
        if not isinstance(content, list):
            logger.warning("Daily pick Claude loop terminating: non-list content")
            break

        text_here = _extract_text_blocks(content)
        logger.info(
            "Daily pick Claude loop stop_reason=%s text_len=%d tool_blocks=%d",
            stop_reason,
            len(text_here or ""),
            sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_use"),
        )

        if stop_reason == "end_turn":
            if text_here:
                final_text = text_here
            elif final_json_nudge_count < 2:
                final_json_nudge_count += 1
                logger.warning(
                    "Daily pick Claude produced end_turn with empty text; requesting explicit final JSON (attempt %d)",
                    final_json_nudge_count,
                )
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "Return your final answer now as a single JSON object only with keys "
                            "model_yes_probability, confidence_score, reasoning, recommended_action, edge. "
                            "Do not call tools and do not include any extra text."
                        ),
                    }
                )
                continue
            if (
                not tool_state.get("web_search_used")
                and web_nudge_count < 2
                and allow_tools
            ):
                web_nudge_count += 1
                messages.append({"role": "assistant", "content": content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            "You have not yet called the web_search tool, or we could not detect a successful "
                            "web_search call. Call web_search now with at least one query clearly relevant to this "
                            "Kalshi market (recent news or facts). After reviewing results, respond with ONLY the "
                            "final JSON object."
                        ),
                    }
                )
                continue
            break

        if stop_reason != "tool_use":
            if text_here:
                final_text = text_here
            logger.warning("Daily pick Claude loop terminating: stop_reason=%s", stop_reason)
            break

        if not allow_tools:
            if text_here:
                final_text = text_here
            logger.warning("Daily pick Claude loop got tool_use when tools disabled")
            break

        messages.append({"role": "assistant", "content": content})
        tool_blocks: list[dict[str, Any]] = []
        for block in content:
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            tid = str(block.get("id") or "")
            tname = str(block.get("name") or "")
            raw_inp = block.get("input")
            inp: dict[str, Any] = raw_inp if isinstance(raw_inp, dict) else {}
            result = await _run_daily_pick_tool(
                tname,
                inp,
                k=k,
                bound_ticker=bound_ticker,
                bound_title=bound_title,
                tool_state=tool_state,
                tool_log=tool_log,
            )
            _note_tag(tname)
            tool_blocks.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tid,
                    "content": json.dumps(result, default=str),
                }
            )

        if not tool_blocks:
            if text_here:
                final_text = text_here
            logger.warning("Daily pick Claude loop terminating: stop_reason=tool_use but no tool blocks")
            break

        user_tool_payload: list[dict[str, Any]] = list(tool_blocks)
        if not tool_state.get("web_search_used") and tool_rounds == max_tool_rounds - 2:
            user_tool_payload.append(
                {
                    "type": "text",
                    "text": (
                        "Reminder: you must call the web_search tool at least once with a query relevant to this "
                        "market before you output the final JSON answer."
                    ),
                }
            )
        messages.append({"role": "user", "content": user_tool_payload})
        tool_rounds += 1

    if not tool_state.get("web_search_used"):
        logger.warning(
            "Daily pick Claude finished without a successful web_search tool call ticker=%s",
            bound_ticker,
        )

    diag = {
        "tool_rounds": tool_rounds,
        "tool_log": tool_log,
        "tool_state": dict(tool_state),
    }
    return final_text, source_tags_ordered, diag


async def enrich_daily_pick_with_claude(
    baseline: dict[str, Any],
    market: dict[str, Any],
    *,
    k: KalshiClient,
    historical_lines: list[str] | None = None,
) -> tuple[dict[str, Any] | None, str | None, list[str]]:
    """
    Run daily-pick analyst with tool use; returns merged analysis, raw final text, and context source tags.
    """
    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        logger.warning("Daily pick Claude skipped: ANTHROPIC_API_KEY is not configured")
        logger.info("enrich_daily_pick_with_claude returning None: missing_anthropic_api_key")
        return None, None, []

    model_id = os.getenv("ANTHROPIC_MODEL_DAILY_PICK", "").strip() or DAILY_PICK_MODEL_DEFAULT
    title = str(market.get("title") or market.get("subtitle") or baseline.get("title") or "")
    ticker = str(market.get("ticker") or baseline.get("ticker") or "")
    implied = float(baseline.get("implied_yes_probability") or 0.0)

    user = build_agentic_daily_pick_user_message(
        ticker=ticker,
        title=title,
        implied_decimal=implied,
        historical_lines=historical_lines,
    )

    text, source_tags, diag = await _daily_pick_agentic_loop(
        model_id=model_id,
        initial_user=user,
        k=k,
        bound_ticker=ticker,
        bound_title=title,
        max_tool_rounds=5,
    )
    logger.info("Claude raw final response: %s", (text[:500] if text else "NONE"))

    if not text:
        logger.warning("Daily pick Claude returned no final text; falling back to baseline")
        logger.info("enrich_daily_pick_with_claude returning None: empty_final_text")
        return None, None, source_tags

    obj = _extract_json_with_key(text, required_key="model_yes_probability")
    if not obj:
        logger.warning("Daily pick Claude JSON extraction failed from final text")
        logger.info("enrich_daily_pick_with_claude returning None: json_extraction_failed")
        return None, text, source_tags
    logger.info("Daily pick Claude JSON extraction succeeded keys=%s", sorted(obj.keys()))

    try:
        parsed = parse_daily_pick_claude_json(obj, implied_decimal=implied)
    except Exception:
        logger.exception("Daily pick Claude parse_daily_pick_claude_json threw exception")
        logger.info("enrich_daily_pick_with_claude returning None: parse_exception")
        return None, text, source_tags
    if not parsed:
        logger.warning("Daily pick Claude JSON parse returned None")
        logger.info("enrich_daily_pick_with_claude returning None: parsed_none")
        return None, text, source_tags

    try:
        parsed = apply_daily_pick_pass_rules(parsed)
    except Exception:
        logger.exception("Daily pick Claude apply_daily_pick_pass_rules threw exception")
        logger.info("enrich_daily_pick_with_claude returning None: pass_rules_exception")
        return None, text, source_tags
    logger.info(
        "Daily pick Claude parse+rules succeeded model_yes=%.4f edge=%.4f action=%s confidence=%s",
        float(parsed.get("model_yes_probability") or 0.0),
        float(parsed.get("edge") or 0.0),
        str(parsed.get("recommended_action") or ""),
        str(parsed.get("confidence_score") or ""),
    )
    my = parsed["model_yes_probability"]
    cs = parsed["confidence_score"]
    edge = parsed["edge"]
    reasoning = parsed["reasoning"]
    ra = parsed["recommended_action"]

    out = dict(baseline)
    out["model_yes_probability"] = my
    out["implied_yes_probability"] = round(implied, 4)
    out["confidence_score"] = cs
    out["confidence"] = round(cs / 100.0, 4)
    out["confidence_label"] = _confidence_label_from_score(cs)
    out["edge_vs_market_yes"] = edge
    out["edge"] = edge
    out["rationale"] = reasoning
    out["reasoning"] = reasoning
    out["recommended_action"] = ra
    out["source"] = "claude_daily_pick_analyst_agentic"

    full_state = diag.get("tool_state") if isinstance(diag, dict) else {}
    if isinstance(full_state, dict):
        if full_state.get("fred_macro") is not None:
            out["fred_macro"] = full_state["fred_macro"]
        if full_state.get("bls_release") is not None:
            out["bls_release"] = full_state["bls_release"]
        if full_state.get("price_trend_summary"):
            out["price_trend_summary"] = full_state["price_trend_summary"]
        wh = full_state.get("web_headlines")
        if isinstance(wh, list) and wh:
            out["claude_research_headlines"] = wh[:15]

    out["claude"] = {
        "model": model_id,
        "raw_response": text[:12000],
        "agentic": True,
        "tool_rounds": diag.get("tool_rounds"),
        "tool_log": diag.get("tool_log"),
        "web_search_used": bool((diag.get("tool_state") or {}).get("web_search_used"))
        if isinstance(diag.get("tool_state"), dict)
        else False,
    }
    return out, text, source_tags
