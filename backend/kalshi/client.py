import httpx
import os
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://trading-api.kalshi.com/trade-api/v2"

class KalshiClient:
    def __init__(self):
        self.token = None
        self.client = httpx.AsyncClient(base_url=BASE_URL)

    async def login(self):
        resp = await self.client.post("/login", json={
            "email": os.getenv("KALSHI_EMAIL"),
            "password": os.getenv("KALSHI_PASSWORD")
        })
        resp.raise_for_status()
        self.token = resp.json()["token"]
        self.client.headers.update({"Authorization": f"Bearer {self.token}"})
        print("✅ Logged in to Kalshi")
        return self.token

    async def get_markets(self, limit=100, cursor=None):
        params = {"limit": limit, "status": "open"}
        if cursor:
            params["cursor"] = cursor
        resp = await self.client.get("/markets", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_all_markets(self):
        """Paginate through every open market on Kalshi"""
        all_markets = []
        cursor = None
        while True:
            data = await self.get_markets(cursor=cursor)
            markets = data.get("markets", [])
            all_markets.extend(markets)
            cursor = data.get("cursor")
            if not cursor or len(markets) == 0:
                break
        print(f"📊 Fetched {len(all_markets)} open markets")
        return all_markets

    async def get_orderbook(self, ticker: str):
        resp = await self.client.get(f"/markets/{ticker}/orderbook")
        resp.raise_for_status()
        return resp.json()

    async def place_order(self, ticker: str, side: str, count: int, price: int):
        """
        side: 'yes' or 'no'
        price: in cents (e.g. 45 = 45 cents)
        count: number of contracts
        """
        resp = await self.client.post("/orders", json={
            "ticker": ticker,
            "side": side,
            "type": "limit",
            "count": count,
            "yes_price": price if side == "yes" else 100 - price,
            "no_price": 100 - price if side == "yes" else price,
            "action": "buy",
            "time_in_force": "fill_or_kill"
        })
        resp.raise_for_status()
        return resp.json()

    async def get_positions(self):
        resp = await self.client.get("/portfolio/positions")
        resp.raise_for_status()
        return resp.json()

    async def get_balance(self):
        resp = await self.client.get("/portfolio/balance")
        resp.raise_for_status()
        return resp.json()