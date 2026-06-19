// Server entry point for Send Game
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { categories, actionCards, emergencyCards } = require('./gameData');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from Vite build in production
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Game Rooms State
const rooms = {};

// Helper to generate room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure uniqueness
  if (rooms[code]) return generateRoomCode();
  return code;
}

// Helper to shuffle array
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Helper to draw and refill deck
function drawCards(deck, count, originalDeck) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      // Refill and shuffle
      deck.push(...shuffle(originalDeck));
    }
    drawn.push(deck.pop());
  }
  return drawn;
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create Room
  socket.on('create_room', ({ playerName, playerId }) => {
    const roomCode = generateRoomCode();
    
    // Choose 10 random categories
    const selectedCategories = shuffle(categories).slice(0, 10);
    
    rooms[roomCode] = {
      code: roomCode,
      status: 'lobby', // 'lobby' | 'name_entry' | 'playing' | 'game_over'
      players: [
        {
          id: socket.id,
          playerId: playerId || Math.random().toString(36).substr(2, 9),
          name: playerName,
          contacts: [],
          hand: [],
          score: 0,
          isHost: true,
          isReady: false,
          isDisconnected: false
        }
      ],
      selectedCategories,
      turnIndex: 0,
      currentTurn: null,
      actionDeck: shuffle(actionCards),
      emergencyDeck: shuffle(emergencyCards),
      winner: null
    };

    socket.join(roomCode);
    socket.emit('room_created', { roomCode, roomState: rooms[roomCode] });
    io.to(roomCode).emit('room_updated', rooms[roomCode]);
    console.log(`Room created: ${roomCode} by ${playerName}`);
  });

  // Join Room
  socket.on('join_room', ({ roomCode, playerName, playerId }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      socket.emit('error_msg', 'غرفة غير موجودة. تأكد من الكود.');
      return;
    }

    if (room.status !== 'lobby') {
      socket.emit('error_msg', 'اللعبة بدأت بالفعل في هذه الغرفة.');
      return;
    }

    if (room.players.length >= 10) {
      socket.emit('error_msg', 'الغرفة ممتلئة (الحد الأقصى 10 لاعبين).');
      return;
    }

    // Add player
    room.players.push({
      id: socket.id,
      playerId: playerId || Math.random().toString(36).substr(2, 9),
      name: playerName,
      contacts: [],
      hand: [],
      score: 0,
      isHost: false,
      isReady: false,
      isDisconnected: false
    });

    socket.join(code);
    io.to(code).emit('room_updated', room);
    console.log(`Player ${playerName} joined room ${code}`);
  });

  // Start Name Entry
  socket.on('start_name_entry', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.status === 'lobby') {
      room.status = 'name_entry';
      io.to(roomCode).emit('room_updated', room);
    }
  });

  // Submit Contacts
  socket.on('submit_names', ({ roomCode, contacts }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.contacts = contacts;
    player.isReady = true;

    // Check if everyone is ready
    const allReady = room.players.every(p => p.isReady);
    if (allReady) {
      // Distribute 5 random action cards to each player
      room.players.forEach(p => {
        p.hand = drawCards(room.actionDeck, 5, actionCards);
      });
      room.status = 'playing';
      room.turnIndex = 0;
      room.currentTurn = {
        numberCard: null,
        victimName: null,
        leftPlayerId: null,
        submittedCards: [],
        chosenCard: null,
        emergencyCard: null,
        stage: 'draw' // 'draw' | 'wait_victim' | 'submit_cards' | 'choose_card' | 'execute'
      };
    }

    io.to(roomCode).emit('room_updated', room);
  });

  // Draw Number Card
  socket.on('draw_number_card', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing') return;

    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== socket.id) return;

    // Draw random number from 1 to 10, or 'Nobody'
    const drawVal = Math.floor(Math.random() * 11) + 1; // 1 to 11
    let numberCard;
    let victimName = null;
    let leftPlayerId = null;
    let stage = 'execute';

    // Draw exactly one action card from the system deck
    const chosenCard = drawCards(room.actionDeck, 1, actionCards)[0];

    if (drawVal === 11) {
      numberCard = 'Nobody';
      const leftIndex = (room.turnIndex + 1) % room.players.length;
      leftPlayerId = room.players[leftIndex].id;
      stage = 'wait_victim'; // Wait for left player to pick a victim from their list
    } else {
      numberCard = drawVal;
      victimName = activePlayer.contacts[numberCard - 1] || "شخص غير معروف";
    }

    room.currentTurn = {
      numberCard,
      victimName,
      leftPlayerId,
      chosenCard,
      emergencyCard: null,
      stage
    };

    io.to(roomCode).emit('room_updated', room);
  });

  // Select victim by player on the left (for Nobody card)
  socket.on('select_nobody_victim', ({ roomCode, victimName }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing' || !room.currentTurn) return;

    if (room.currentTurn.leftPlayerId !== socket.id) return;

    room.currentTurn.victimName = victimName;
    room.currentTurn.stage = 'execute'; // Move straight to execution!

    io.to(roomCode).emit('room_updated', room);
  });

  // Execute success (Active Player earns 50 points)
  socket.on('execute_success', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing' || !room.currentTurn) return;

    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== socket.id) return;

    // Add 50 points
    activePlayer.score += 50;

    // Check Win Condition
    if (activePlayer.score >= 250) {
      room.status = 'game_over';
      room.winner = activePlayer;
    } else {
      // Advance turn
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      room.currentTurn = {
        numberCard: null,
        victimName: null,
        leftPlayerId: null,
        chosenCard: null,
        emergencyCard: null,
        stage: 'draw'
      };
    }

    io.to(roomCode).emit('room_updated', room);
  });

  // Chicken out (Draw emergency card)
  socket.on('chicken_out', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing' || !room.currentTurn) return;

    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== socket.id) return;

    // Draw 1 emergency card
    const emergency = drawCards(room.emergencyDeck, 1, emergencyCards)[0];
    room.currentTurn.emergencyCard = emergency;

    io.to(roomCode).emit('room_updated', room);
  });

  // Execute emergency card (Active Player earns 20 points)
  socket.on('execute_emergency', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.status !== 'playing' || !room.currentTurn) return;

    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== socket.id) return;

    // Add 20 points
    activePlayer.score += 20;

    // Check Win Condition
    if (activePlayer.score >= 250) {
      room.status = 'game_over';
      room.winner = activePlayer;
    } else {
      // Advance turn
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      room.currentTurn = {
        numberCard: null,
        victimName: null,
        leftPlayerId: null,
        chosenCard: null,
        emergencyCard: null,
        stage: 'draw'
      };
    }

    io.to(roomCode).emit('room_updated', room);
  });

  // Restart Game
  socket.on('restart_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Reset scores, hands, ready status, decks, categories
    room.status = 'lobby';
    room.winner = null;
    room.selectedCategories = shuffle(categories).slice(0, 10);
    room.actionDeck = shuffle(actionCards);
    room.emergencyDeck = shuffle(emergencyCards);
    
    room.players.forEach(p => {
      p.score = 0;
      p.contacts = [];
      p.hand = [];
      p.isReady = false;
    });

    io.to(roomCode).emit('room_updated', room);
  });

  // Reconnect Player
  socket.on('reconnect_player', ({ roomCode, playerId }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];
    if (!room) {
      socket.emit('reconnect_failed', 'الغرفة لم تعد موجودة.');
      return;
    }

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) {
      socket.emit('reconnect_failed', 'اللاعب غير موجود في هذه الغرفة.');
      return;
    }

    // Re-associate socket
    player.id = socket.id;
    player.isDisconnected = false;
    socket.join(code);

    socket.emit('reconnected', { roomState: room });
    io.to(code).emit('room_updated', room);
    console.log(`Player ${player.name} (${playerId}) reconnected to room ${code}`);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find room the player was in
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        player.isDisconnected = true;
        console.log(`Player ${player.name} (${player.playerId}) disconnected. Waiting 20s for reconnection.`);
        io.to(roomCode).emit('room_updated', room);

        const targetPlayerId = player.playerId;
        setTimeout(() => {
          const currentRoom = rooms[roomCode];
          if (!currentRoom) return;
          const pIdx = currentRoom.players.findIndex(p => p.playerId === targetPlayerId);
          if (pIdx !== -1 && currentRoom.players[pIdx].isDisconnected) {
            const removedPlayer = currentRoom.players[pIdx];
            console.log(`Grace period expired. Removing player ${removedPlayer.name} from room ${roomCode}`);
            currentRoom.players.splice(pIdx, 1);

            // If room is empty, delete it
            if (currentRoom.players.length === 0) {
              delete rooms[roomCode];
              console.log(`Room ${roomCode} deleted because it has no players.`);
            } else {
              // If the host left, assign new host
              if (removedPlayer.isHost) {
                currentRoom.players[0].isHost = true;
              }
              
              // Adjust turnIndex if active player left
              if (currentRoom.status === 'playing') {
                if (currentRoom.turnIndex >= currentRoom.players.length) {
                  currentRoom.turnIndex = 0;
                }
                // If active player left, reset turn state
                if (currentRoom.players[currentRoom.turnIndex].playerId === targetPlayerId) {
                  currentRoom.currentTurn = {
                    numberCard: null,
                    victimName: null,
                    leftPlayerId: null,
                    chosenCard: null,
                    emergencyCard: null,
                    stage: 'draw'
                  };
                }
              }
              
              io.to(roomCode).emit('room_updated', currentRoom);
            }
          }
        }, 20000); // 20 seconds grace period
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Send Game Server running on port ${PORT}`);
});
