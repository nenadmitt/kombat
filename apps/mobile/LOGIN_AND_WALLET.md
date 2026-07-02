Currently i have some test screens that are randomly wired up.

Lets do the setup.

I want to create Login/SignedIn/Wallet page.

By default, the user sees the LoginScreen with Continue button.

When Continue button is clicked, we show a modal coming from bottom with sign in methods.

For now we just support sign in with email ( lets also add Login with google etc but disabled)

The user types an email and we send him an email and show the form for typeing code send by email.

When he logs in, we store the jwt in local storage and if he logs in again, we do not show login flow.

When logged in, we check if it has a wallet. If not we create it and securely store mneumonics and private key on device. 

Use Viem for web3 stuff. When wallet is created, lets use wallet-screen for figgma.

The wallet screen should just have receive/deplosit/withdraw buttons ( mocked for now) and show USDT/USDC/ETH/KOMBAT balance. no Recent transactions.

## API

For api integration, we can create maybe an api client in /core and reuse that. Maybe even move server types in core. so they are reused instead of being duplicated.