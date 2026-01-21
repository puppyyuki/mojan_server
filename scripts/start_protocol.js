const path = require('path');
const { spawn } = require('child_process');

const serverPath = path.join(__dirname, '..', 'server.js');
const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: { ...process.env, USE_PROTOCOL_ENGINE: '1' },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('Failed to start protocol server:', err);
  process.exit(1);
});
