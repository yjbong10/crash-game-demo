const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const router = express.Router();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io/',
  cors: {
    origin: "*"
  }
});
const PORT = process.env.PORT || 9000

let STATE = {
  round: {
    id: null,
    state: 'ROUND_START',
    hasStateRan: false
  },
  players: {},
  game: {
    onBoardedCount: 0,
    ejectedCount: 0,
    position: 0,
    isCrash: false
  }
}

const CLIENTS = {}
let IS_RUNNING = false
let FSM = null

io.on('connection', (socket) => {
  console.log(`${socket.id} connected`);

  socket.on("START", (data) => {
    const added = addPlayer(socket) 

    if (added) {
      const payload = {
        id: socket.id,
        state: STATE
      }
  
      socket.emit('START_SUCCESS', payload)
      broadcastState()
  
      if (!IS_RUNNING) {
        run()
      }
    }
  });

  socket.on("BET", (data) => {
    const payload = {
      id: socket.id,
      state: STATE
    }

    const success = tryPlaceBet(socket.id, data, payload)

    if (success) {  
      broadcastToAll('BET_SUCCESS', payload)
    } else {
      socket.emit('BET_FAILED', payload)
    }
  });

  socket.on("EJECT", (data) => {
    const payload = {
      id: socket.id,
      state: STATE
    }

    const success = tryEject(socket.id, data, payload)

    if (success) {  
      broadcastToAll('EJECT_SUCCESS', payload)
    } else {
      socket.emit('EJECT_FAILED', payload)
    }
  });

  socket.on('disconnect', () => {
    console.log(`${socket.id} disconnected`);
    removePlayer(socket)
    broadcastState()

    if (!SHOULD_RUN()) {
      clearInterval(FSM)
      FSM = null;
      IS_RUNNING = false
    }
  });
});

const SHOULD_RUN = () => {
  return Object.keys(CLIENTS).length > 0
}

const run = () => {
  if (FSM === null) {
    FSM = setInterval(() => {
      if (SHOULD_RUN()) {
        IS_RUNNING = true
        switch(STATE.round.state) {
          case 'ROUND_START':
            if (!STATE.round.hasStateRan) {
              console.log('ROUND_START')
              STATE.round.hasStateRan = true
              broadcastToAll('ROUND_START', {state: STATE})
            
              setTimeout(() => {
                STATE.round.state = 'ROUND_CLOSE'
                STATE.round.hasStateRan = false
              }, 5000)
            }
            break;
          case 'ROUND_CLOSE':
            if (!STATE.round.hasStateRan) {
              console.log('ROUND_CLOSE')
              STATE.round.hasStateRan = true
              broadcastToAll('ROUND_CLOSE', {state: STATE})
            
              console.log('start game')
              startGame(() => {
                STATE.round.state = 'ROUND_END'
                STATE.round.hasStateRan = false
              })
            }
  
            break;
          case 'ROUND_END':
            if (!STATE.round.hasStateRan) {
              console.log('ROUND_END')
              STATE.round.hasStateRan = true
              settleBet()
              broadcastToAll('ROUND_END', {state: STATE})
            
              setTimeout(() => {
                STATE.round.state = 'ROUND_START'
                STATE.round.hasStateRan = false
                STATE.game.position = 0
                STATE.game.onBoardedCount = 0
                STATE.game.ejectedCount = 0
                STATE.game.isCrash = false
              }, 5000)
            }
            break;
        }
      } else {
        IS_RUNNING = false
      }
    }, 1000) 
  }
}

const startGame = (callback) => {
  const max = 200
  const min = 0
  const outcomePosition = Math.floor(Math.random() * (max - min + 1)) + min;

  const autoEjectPlayerBets = {}
  const players = STATE.players

  for(const playerId in players) {
    const player = players[playerId]

    for(const bet of Object.values(player.bets)) {
      if (bet.autoEject && bet.autoEject < outcomePosition) {
        // autoEjectPlayerBets[bet.autoEject] = autoEjectPlayerBets[bet.autoEject] || {}
        // autoEjectPlayerBets[bet.autoEject][playerId] = autoEjectPlayerBets[bet.autoEject][playerId] || []
        // autoEjectPlayerBets[bet.autoEject][playerId].push(bet)

        autoEjectPlayerBets[bet.autoEject] = autoEjectPlayerBets[bet.autoEject] || []
        bet["playerId"] = playerId
        autoEjectPlayerBets[bet.autoEject].push(bet)
      }
    }
  }

  console.log(outcomePosition)

  const launchRocket = setInterval(() => {
    if (STATE.game.position < outcomePosition) {
      if (autoEjectPlayerBets[ STATE.game.position]) {
        tryAutoEjects(autoEjectPlayerBets[ STATE.game.position])
      }

      broadcastToAll("ROCKET", {game: STATE.game})

      STATE.game.position ++
    } else {
      if (outcomePosition !== max) {
        STATE.game.isCrash = true
      }
      broadcastToAll("ROCKET", {game: STATE.game})
      clearInterval(launchRocket);
      callback();
    }

  }, 100);
}

const broadcastToAll = (eventName, payload) => {
  for (const client in CLIENTS) {
    CLIENTS[client].emit(eventName, payload)
  }
}

const broadcastState = () => {
  broadcastToAll('UPDATE_STATE', {state: STATE})
}

const addPlayer = (socket) => {
  if (CLIENTS[socket.id]) {
    return false
  } else {
    CLIENTS[socket.id] = socket
    STATE.players[socket.id] = {
      balance: 10000,
      bets: []
    }
    
    return true
  }
}

const removePlayer = (socket) => {
  delete CLIENTS[socket.id]
  delete STATE.players[socket.id]
}

const validateBetParam = (betParam) => {
  const isBetAmountValidate = Number.isInteger(betParam.betAmount)
  const  isAutoEjectValidate = betParam.autoEject === null || Number.isInteger(betParam.autoEject)

  return isBetAmountValidate && isAutoEjectValidate
}

const tryPlaceBet = (playerId, betParam, payload) => {
  player = STATE.players[playerId]

  if (!player || !validateBetParam(betParam)) {
    return false
  }

  const canBet = (STATE.round.state === 'ROUND_START' && player.bets.length <= 3 && player.balance >= betParam.betAmount)

  if (canBet) {
    bet = {
      betId: `${playerId}-bet-${player.bets.length + 1}`,
      betAmount: betParam.betAmount,
      autoEject: betParam.autoEject,
      ejectedAt: null
    }

    player.bets.push(bet)
    
    payload.bettedBet = bet
    player.balance -= betParam.betAmount
    STATE.game.onBoardedCount += 1    
  }

  return canBet
}

const tryEject = (playerId, betParam, payload) => {
  player = STATE.players[playerId]
  betId = betParam.betId

  if (!player || player.bets.length === 0) {
    return false
  }

  const bet = player.bets.find(bet => (bet.betId === betId && !bet.ejectedAt));

  const canEject = (STATE.round.state === 'ROUND_CLOSE' && bet)

  if (canEject) {
    bet.ejectedAt = STATE.game.position
    STATE.game.onBoardedCount -= 1 
    STATE.game.ejectedCount += 1 
    payload.ejectedBet = bet
  } 

  return canEject
}

const tryAutoEjects = (bets) => {
  const autoEjectedBets = []

  bets.forEach((bet) => {
    if (!bet.ejectedAt) {
      bet.ejectedAt = STATE.game.position
      autoEjectedBets.push(bet)
    }
  })

  const autoEjectedBetsCount = autoEjectedBets.length

  if (autoEjectedBetsCount > 0) {

    STATE.game.onBoardedCount -= autoEjectedBetsCount
    STATE.game.ejectedCount += autoEjectedBetsCount

    const payload = {
      state: STATE,
      autoEjectedBets: autoEjectedBets
    }

    broadcastToAll('AUTO_EJECT_SUCCESS', payload)
  } 
}

const settleBet = () => {
  players = STATE.players
  
  for(player of Object.values(players)) {
    bets = player.bets
    balance = player.balance

    if (bets.length > 0) {
      bets.forEach((bet) => {
        if (bet.ejectedAt) {
          player.balance += bet.betAmount * (bet.ejectedAt + 1)
        }
      })

      player.bets = []
    }
  }
}

router.use((req, res, next) => {
  console.log(req.method, req.url, req.path);
  next();
});

app.use('/', router);

app.get('/', (req, res) => {
  res.redirect('/crash-game-demo');
});

router.use('/crash-game-demo', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`)
})
