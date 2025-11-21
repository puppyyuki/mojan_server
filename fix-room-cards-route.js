const fs = require('fs');
const path = require('path');

// Read server.js
const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// Find the health check endpoint line
const healthCheckLine = '// 健康檢查端點（Render 需要）';
const insertCode = `
// ===== 房卡產品路由（使用獨立路由文件）=====
app.locals.prisma = prisma;
const roomCardsRoutes = require('./routes/roomCards');
app.use('/api/room-cards', roomCardsRoutes);
console.log('[Server] Room cards routes mounted at /api/room-cards');

`;

// Insert before health check
content = content.replace(healthCheckLine, insertCode + healthCheckLine);

// Write back
fs.writeFileSync(serverPath, content, 'utf8');
console.log('✅ Successfully added room cards route to server.js');
