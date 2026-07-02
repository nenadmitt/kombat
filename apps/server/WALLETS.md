Lets create Wallets module.

We need an endpoint for generating the wallet. This is an authenticated request that user can create after loging in.

The endpoints /api/v1/wallets POST, create wallet with type { 0-1 ethereum/solana } for now we will only support ethereum.

it returns pneumonics. A list of 12-14-16 characters that can be used to restore wallet. 

We will use viem library for web3 stuff.

When wallet is created, we will store it and its private key encrypted using the secret from env.

Lets also expose endpoint for fetching wallets for a current user. We just need wallet address/type.

Lets limit for now wallet creation to 1.