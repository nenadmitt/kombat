Lets start creating a temp battleship game. As a part of this, we'll just create a ui.

I have created BattleshipGame.tsx file ( There is already a BattleshipScreen.tsx, but lets not update that )

The battleship battle consists of 2 steps:

1. Step - SETUP BOARD
This is a setup step, you can see the exact design in apps/mobile/claude/battleship_start_screen.png

The idea is that users has 4 ships that he can place, each taking 2-4 spaces.

1. Destroyer - 4 spaces
2. Battleship - 5 spaces
3. Frigate - 3 spaces
4. Scount - 2 spaces.

The ship can be placed horizontally or verticaly and it is done on touch.

2. Step - GAMEPLAY

We'll do that afterwards