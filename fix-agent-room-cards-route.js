const fs = require('fs');
const path = require('path');

// Read server.js
const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Find the room cards route line
const roomCardsLine = "app.use('/api/room-cards', roomCardsRoutes);";
const insertCode = `
const agentRoomCardsRoutes = require('./routes/agentRoomCards');
app.use('/api/agents', agentRoomCardsRoutes);
console.log('[Server] Agent room cards routes mounted at /api/agents/room-cards');
`;

// Insert after room cards route
content = content.replace(roomCardsLine, roomCardsLine + insertCode);

// Write back
fs.writeFileSync(serverPath, content, 'utf8');
console.log('✅ Successfully added agent room cards route to server.js');
