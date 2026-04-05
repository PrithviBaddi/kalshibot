import os
import time
from urllib.parse import quote, urlparse

import httpx
from dotenv import load_dotenv

from kalshi.signing import load_private_key_from_env, load_private_key_from_pem_bytes, sign_pss_text

load_dotenv()

# Production; use https://demo-api.kalshi.co/trade-api/v2 for demo accounts
DEFAULT_BASE = "https://api.elections.kalshi.com/trade-api/v2"


class KalshiClient:
    """
    Kalshi Trade API v2 client. Auth is RSA (API Key ID + private key), not email/password.
    Create keys in Kalshi: Account & security → API Keys.
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        api_key_id: str | None = None,
        private_key_pem: str | None = None,
    ):
        self.api_key_id = (api_key_id or os.getenv("KALSHI_API_KEY_ID") or "").strip()
        if not self.api_key_id:
            raise ValueError("Set KALSHI_API_KEY_ID (UUID from Kalshi API Keys page)")

        if private_key_pem:
            pem = private_key_pem.strip().encode("utf-8")
            self._private_key = load_private_key_from_pem_bytes(pem)
        else:
            self._private_key = load_private_key_from_env()
        resolved = base_url or os.getenv("KALSHI_API_BASE", DEFAULT_BASE)
        # Kalshi endpoints can be slow intermittently; avoid flaky "Failed to fetch" UX
        # by using a more forgiving timeout.
        self.client = httpx.AsyncClient(base_url=resolved, timeout=httpx.Timeout(20.0))

    async def aclose(self):
        await self.client.aclose()

    @property
    def signing_private_key(self):
        """Same RSA key used for REST, WebSocket handshake, and request signing."""
        return self._private_key

    @property
    def rest_base(self) -> str:
        return str(self.client.base_url).rstrip("/")

    def _signing_path(self, method: str, path: str, **kwargs) -> str:
        """Path used in the signature (must match request URL path, no query string)."""
        req = self.client.build_request(method, path, **kwargs)
        return urlparse(str(req.url)).path

    async def _request(self, method: str, path: str, **kwargs):
        sign_path = self._signing_path(method, path, **kwargs)
        timestamp = str(int(time.time() * 1000))
        signature = sign_pss_text(self._private_key, timestamp, method, sign_path)
        headers = {
            "KALSHI-ACCESS-KEY": self.api_key_id,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            **kwargs.pop("headers", {}),
        }
        return await self.client.request(method, path, headers=headers, **kwargs)

    async def login(self):
        """Verify credentials by calling the balance endpoint (Kalshi has no session login)."""
        resp = await self._request("GET", "/portfolio/balance")
        resp.raise_for_status()
        print("✅ Authenticated to Kalshi (API key + RSA signature)")
        return resp.json()

    async def get_markets(
        self,
        limit=100,
        cursor=None,
        *,
        series_ticker=None,
        event_ticker=None,
        mve_filter=None,
        tickers=None,
        status: str | None = "open",
    ):
        """GET /markets — see Kalshi docs for mve_filter, series_ticker, event_ticker."""
        params = {"limit": limit}
        if status is not None:
            params["status"] = status
        if cursor:
            params["cursor"] = cursor
        if series_ticker:
            params["series_ticker"] = series_ticker
        if event_ticker:
            params["event_ticker"] = event_ticker
        if mve_filter:
            params["mve_filter"] = mve_filter
        if tickers:
            params["tickers"] = tickers
        resp = await self._request("GET", "/markets", params=params)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _coerce_market_payload(data: object) -> dict | None:
        if not isinstance(data, dict):
            return None
        m = data.get("market")
        if isinstance(m, dict):
            return m
        if data.get("ticker"):
            return data
        return None

    async def get_market(self, ticker: str):
        """Single market snapshot (REST); useful to compare with WebSocket ticker."""
        seg = quote(str(ticker), safe="-_.~")
        resp = await self._request("GET", f"/markets/{seg}")
        resp.raise_for_status()
        return resp.json()

    async def get_market_snapshot(self, ticker: str) -> dict | None:
        """
        Resolve one market dict for pricing (yes bid/ask). More forgiving than get_market alone:
        uses path encoding, falls back to GET /markets?tickers= when the single-market path fails
        (404, rate limit, etc.).
        """
        t = str(ticker)
        seg = quote(t, safe="-_.~")
        try:
            resp = await self._request("GET", f"/markets/{seg}")
            resp.raise_for_status()
            m = self._coerce_market_payload(resp.json())
            if m:
                return m
        except httpx.HTTPStatusError as e:
            # Retry via list endpoint on missing market or rate limit — avoids hard failures.
            if e.response.status_code not in (404, 429):
                raise
        except httpx.HTTPError:
            return None

        for st in ("open", None):
            try:
                data = await self.get_markets(limit=100, tickers=t, status=st)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    return None
                continue
            except httpx.HTTPError:
                continue
            for m in data.get("markets") or []:
                if isinstance(m, dict) and m.get("ticker") == t:
                    return m
        return None

    async def get_series_list(
        self,
        category: str | None = None,
        tags: str | None = None,
        include_volume: bool = False,
    ):
        """GET /series — discover `series_ticker` values by category/tags (politics, weather, etc.)."""
        params: dict = {}
        if category:
            params["category"] = category
        if tags:
            params["tags"] = tags
        if include_volume:
            params["include_volume"] = "true"
        resp = await self._request("GET", "/series", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_all_markets(self):
        """Paginate through every open market on Kalshi"""
        all_markets = []
        cursor = None
        page = 0
        while True:
            data = await self.get_markets(cursor=cursor)
            markets = data.get("markets", [])
            all_markets.extend(markets)
            page += 1
            print(f"  … page {page}: {len(all_markets)} open markets so far", flush=True)
            cursor = data.get("cursor")
            if not cursor or len(markets) == 0:
                break
        print(f"📊 Fetched {len(all_markets)} open markets total")
        return all_markets

    async def get_orderbook(self, ticker: str):
        resp = await self._request("GET", f"/markets/{ticker}/orderbook")
        resp.raise_for_status()
        return resp.json()

    async def place_order(self, ticker: str, side: str, count: int, price: int):
        """
        side: 'yes' or 'no'
        price: in cents (e.g. 45 = 45 cents)
        count: number of contracts
        """
        resp = await self._request(
            "POST",
            "/orders",
            json={
                "ticker": ticker,
                "side": side,
                "type": "limit",
                "count": count,
                "yes_price": price if side == "yes" else 100 - price,
                "no_price": 100 - price if side == "yes" else price,
                "action": "buy",
                "time_in_force": "fill_or_kill",
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_positions(self):
        resp = await self._request("GET", "/portfolio/positions")
        resp.raise_for_status()
        return resp.json()

    async def get_balance(self):
        resp = await self._request("GET", "/portfolio/balance")
        resp.raise_for_status()
        return resp.json()
