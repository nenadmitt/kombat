Okay. Lets start creating a game room functionality.

Lets start with server, we already have games module. 
We want to create an ability for authenticated user to create a game room. Only 1 game room allowed, if user wants to create another, he needs to close the existing one. The existing one can be closed if the game hasnt started.

The game room will have game type. We'll have a GameType enum and for now just support NavalBattle game. ( Battleships )

The game room also needs number of player but that is dependant on a game, for Naval battle its 2.

We also need to expose endpoint for fetching the game rooms that are pending so that other users can see them and join latter ( but we will not do that now )