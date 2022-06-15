# crash-game-demo

A simple Crash Game Demo. 

Reference game: [bustabit](https://www.bustabit.com/play).

### How to play?
Press START button on the top left, the game will start.

On ROUND_START, place your bet by enter the bet amount and click the 'bet' button on the bottom right of the page.

On ROUND_CLOSE, the multiplier will start to increase, eject the bet before it crashed. 

Your payout will be the bet amount placed multiplied by the multiplier ejected at.

If the game crashed, you will get nothing.


### Project Description
A finate-state-machine on server-side to manipulate the states transitioning between ROUND_START, ROUND_CLOSE and ROUND_END.

ROUND_START - Server accepting bet request from client-side. 

ROUND_CLOSE - Server generate an outcome and emit to client-side, accepting eject request only.

ROUND_END - Server calculate player's payout and emit to client-side, stop accepting any request.

Client and Server be communicating to each other through websocket.

### `Technologies used:`
* Html & Bootstrap
* Javascript
* Node.js & Express.js
* Socket.io
