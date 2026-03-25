"""
Single upstream Kalshi WebSocket (ticker channel) + fan-out to browser clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
import ssl

import certifi
import websockets

from kalshi.ws import build_ws_connect_headers, rest_base_to_ws_url

logger = logging.getLogger(__name__)

SUBSCRIBE_TICKER = json.dumps(
    {"id": 1, "cmd": "subscribe", "params": {"channels": ["ticker"]}}
)


class TickerHub:
    def __init__(self, rest_base: str, api_key_id: str, private_key) -> None:
        self._ws_url = rest_base_to_ws_url(rest_base)
        self._api_key_id = api_key_id
        self._private_key = private_key
        self._subs: list[asyncio.Queue[str]] = []
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="kalshi-ticker-hub")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def register(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subs.append(q)
        return q

    async def unregister(self, q: asyncio.Queue[str]) -> None:
        async with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    async def _fan_out(self, raw: str) -> None:
        async with self._lock:
            targets = list(self._subs)
        for q in targets:
            try:
                q.put_nowait(raw)
            except asyncio.QueueFull:
                try:
                    _ = q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    q.put_nowait(raw)
                except asyncio.QueueFull:
                    pass

    async def _run(self) -> None:
        delay = 1.0
        while not self._stop.is_set():
            try:
                headers = build_ws_connect_headers(self._api_key_id, self._private_key)
                ssl_ctx = ssl.create_default_context(cafile=certifi.where())
                async with websockets.connect(
                    self._ws_url,
                    additional_headers=headers,
                    ssl=ssl_ctx if self._ws_url.startswith("wss") else None,
                    ping_interval=20,
                    ping_timeout=60,
                ) as ws:
                    logger.info("Kalshi WebSocket connected: %s", self._ws_url)
                    delay = 1.0
                    await ws.send(SUBSCRIBE_TICKER)
                    async for raw in ws:
                        await self._fan_out(raw if isinstance(raw, str) else raw.decode())
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Kalshi WebSocket error; reconnecting in %.1fs", delay)
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=delay)
                    break
                except TimeoutError:
                    pass
                delay = min(delay * 2, 60.0)
        logger.info("Kalshi ticker hub stopped")
