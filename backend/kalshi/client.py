import base64
import os
import time
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv

load_dotenv()

# Production; use https://demo-api.kalshi.co/trade-api/v2 for demo accounts
DEFAULT_BASE = "https://api.elections.kalshi.com/trade-api/v2"


def _load_private_key():
    path = os.getenv("KALSHI_PRIVATE_KEY_PATH")
    pem = os.getenv("KALSHI_PRIVATE_KEY")
    if path:
        with open(path, "rb") as f:
            data = f.read()
    elif pem:
        data = pem.encode() if isinstance(pem, str) else pem
    else:
        raise ValueError(
            "Set KALSHI_PRIVATE_KEY_PATH (path to .key file) or KALSHI_PRIVATE_KEY (PEM string)"
        )
    return serialization.load_pem_private_key(data, password=None, backend=default_backend())


def _sign(private_key, timestamp: str, method: str, path: str) -> str:
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


class KalshiClient:
    """
    Kalshi Trade API v2 client. Auth is RSA (API Key ID + private key), not email/password.
    Create keys in Kalshi: Account & security → API Keys.
    """

    def __init__(self, base_url: str | None = None):
        self.api_key_id = os.getenv("KALSHI_API_KEY_ID")
        if not self.api_key_id:
            raise ValueError("Set KALSHI_API_KEY_ID (UUID from Kalshi API Keys page)")

        self._private_key = _load_private_key()
        resolved = base_url or os.getenv("KALSHI_API_BASE", DEFAULT_BASE)
        self.client = httpx.AsyncClient(base_url=resolved)

    def _signing_path(self, method: str, path: str, **kwargs) -> str:
        """Path used in the signature (must match request URL path, no query string)."""
        req = self.client.build_request(method, path, **kwargs)
        return urlparse(str(req.url)).path

    async def _request(self, method: str, path: str, **kwargs):
        sign_path = self._signing_path(method, path, **kwargs)
        timestamp = str(int(time.time() * 1000))
        signature = _sign(self._private_key, timestamp, method, sign_path)
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

    async def get_markets(self, limit=100, cursor=None):
        params = {"limit": limit, "status": "open"}
        if cursor:
            params["cursor"] = cursor
        resp = await self._request("GET", "/markets", params=params)
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
