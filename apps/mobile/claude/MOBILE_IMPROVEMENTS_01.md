Lets work on a couple of mobile improvements.

1. The game history is broken for some reason. Even tho 1 player won and took stake, it am just seeing "VOIDED" games with free stake. Lets fix this to show proper game history.

By default show 10 games and infinite scroll until bottom, load 5-10 more every time.

Before starting to work on this functionality, lets remove all game_rooms from the database/escrows etc. So we can start fresh.

2. Confirmation models. Currently when we approve ( staked game), leave game etc, we're using Alert from os/etc.

I want to create a dedicated overlay ( starts from bottom ) modal that can be reused for all confirmrations

3. When user starts a stacked game, and we're waiting for transations, we say ( waiting for stake etc), but lets implement some funnier/better loading screen that doesn't mention implementation details.

4. Remove all em-dashes and never use them trough any file. Create some Claude.md file and put this there

5. In game creation modal, Instead of Betting Asset, just say Asset, put icon next to asset ( some icon for free also.)

Also, the user can update asset amount only by - +, i want to be able to type. 