import asyncio
from kalshi.client import KalshiClient

async def main():
    client = KalshiClient()
    await client.login()
    
    # Test 1: fetch all markets
    markets = await client.get_all_markets()
    print(f"\nFirst 3 markets:")
    for m in markets[:3]:
        print(f"  {m['ticker']} — {m['title']} — Yes price: {m.get('yes_bid', '?')}¢")
    
    # Test 2: check your balance
    balance = await client.get_balance()
    print(f"\nYour balance: ${balance.get('balance', 0) / 100:.2f}")

asyncio.run(main())