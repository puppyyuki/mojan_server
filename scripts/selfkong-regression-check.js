const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');

const forbiddenPatterns = [
  "io.to(playerId).emit('selfKongAvailable'",
  'io.to(playerId).emit("selfKongAvailable"'
];

const hits = forbiddenPatterns.filter(p => source.includes(p));

if (hits.length > 0) {
  console.error(`[selfkong-regression-check] FAIL: Found forbidden emit patterns:\n- ${hits.join('\n- ')}`);
  process.exit(1);
}

console.log('[selfkong-regression-check] OK');
