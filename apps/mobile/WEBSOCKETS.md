On a backend server, we have a websocket server.

In mobile app, lets connect to the said server.

We will have a separate websocket.store that will keep data about connected/disconnected.

We will have 1 websocket connection per user that will be resued in games etc.

The store can have a generic methods for sending from/to channel or subscribing to a channel etc.