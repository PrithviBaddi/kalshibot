#!/usr/bin/env python3
import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kalshi.client import KalshiClient


async def main():
    parser = argparse.ArgumentParser(description="Smoke-test Kalshi API auth and market fetch")
    parser.add_argument(
        "--all-markets",
        action="store_true",
        help="Fetch every open market (many API pages; can take several minutes)",
    )
    args = parser.parse_args()

    client = KalshiClient()
    await client.login()

    if args.all_markets:
        print("\nScanning all open markets (paginated). This can take a while…", flush=True)
        markets = await client.get_all_markets()
    else:
        print("\nFetching first page of open markets (limit=10)…", flush=True)
        data = await client.get_markets(limit=10)
        markets = data.get("markets", [])
        print(f"Got {len(markets)} markets on this page.\n", flush=True)

    print("Sample markets:")
    for m in markets[:3]:
        yb = m.get("yes_bid")
        ya = m.get("yes_ask")
        title = m.get("title", "")
        if len(title) > 60:
            title = title[:60] + "…"
        price_hint = f"yes bid/ask {yb}/{ya}" if yb is not None or ya is not None else str(m.get("last_price", "?"))
        print(f"  {m['ticker']} — {title} — {price_hint}", flush=True)

    balance = await client.get_balance()
    print(f"\nYour balance: ${balance.get('balance', 0) / 100:.2f}", flush=True)
    print("\nStage 1 (connect + read account + read markets): done.", flush=True)
    if not args.all_markets:
        print("Tip: run with --all-markets to paginate every open contract (slow).", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
