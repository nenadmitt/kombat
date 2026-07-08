Lets start working on base game starting logic.

We already have an ability to create a room and from other user to see the room.

1. Lets add a join button to gameloby list.
2. Lets add a join endpoint where user will join the game ( find a way to store this in the db)
3. Lets create a game object in memory that will hold game state, for now game state can be string[]
4. When user connect both creator of game and joined user are transfered to Battleship screen. For now let the battleship screen be very simple black screen with input and SEND button. Both users can send messages and they will be rendered on screen.