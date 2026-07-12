Lets add a real token balances lookup.

We have an alchemy key.

Have some sort of map, where you store chain {
    usdc: address
    usdt: address
    kombat: address
    env: native coin no need for address
}

Lets add viem for blockchain interaction. Create a loop where you'll check every minute ( while user is on wallet screen and refresh states. Do one multicall)

Add a refresh button (but do not allow spamming it)

DO so for base and eth sepolia.

for base we do not have combat coin, but we do have it for ethereum sepolia