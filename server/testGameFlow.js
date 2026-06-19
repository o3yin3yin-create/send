const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:5001';

console.log('--- Starting Send Game Server Integration Test ---');

// Mock sockets
const socket1 = io(SERVER_URL);
let roomCode = '';

socket1.on('connect', () => {
  console.log('✓ Player 1 connected');
  
  // Create Room
  socket1.emit('create_room', { playerName: 'احمد' });
});

socket1.on('room_created', ({ roomCode: code, roomState }) => {
  roomCode = code;
  console.log(`✓ Room created successfully. Code: ${roomCode}`);
  console.log(`✓ Categories generated: ${roomState.selectedCategories.length} categories`);

  if (roomState.selectedCategories.length === 10) {
    console.log('✓ Category check passed (Got exactly 10).');
  } else {
    console.error('❌ Error: Expected 10 categories, got ' + roomState.selectedCategories.length);
    process.exit(1);
  }

  // Connect player 2
  const socket2 = io(SERVER_URL);
  
  socket2.on('connect', () => {
    console.log('✓ Player 2 connected');
    socket2.emit('join_room', { roomCode, playerName: 'عمر' });
  });

  socket1.on('room_updated', (room) => {
    if (room.players.length === 2 && room.status === 'lobby') {
      console.log('✓ Player 2 joined room. Real-time updates working.');
      console.log('--- All Socket integration checks successful! ---');
      socket1.disconnect();
      socket2.disconnect();
      process.exit(0);
    }
  });
});

setTimeout(() => {
  console.error('❌ Integration test timeout.');
  process.exit(1);
}, 6000);
