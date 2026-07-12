The plan for our games is for us to allow use to "stake" some coins when it starts the game.

Currently we support 4 coins NATIVE ETH/KOMBAT/USDC/USDT

User should also be able to create a FREE game, without any stake.

So what we need to do i as follow.

When both users join the game, we need to transfer the coins from them to our smart contract ( we have the escrow contract ).

We also have access to users private keys/wallets, or we can ask for permit signature ( but not sure how to handle this for native eth). Or since we have wallets, we can give our smart contract approval if none given. You decide.

So before game starts, we transfer coins calling createStake and put money in escrow

When game completes, we call settleStake and settle, depending on which user wins.

The game matches should have this information, who won, how much stake, which token, so we can show this in history or eventually into his activity