const { spawn } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'start_protocol.js');
const child = spawn(process.execPath, [script], {
  env: { ...process.env, PORT: '0', QUIET_GAME_LOGS: '1' },
});

let started = false;
let out = '';

function onData(buf) {
  const s = buf.toString();
  out += s;
  if (!started && (s.includes('伺服器啟動於') || s.includes('Server listening'))) {
    started = true;
    child.kill('SIGTERM');
  }
}

child.stdout?.on('data', onData);
child.stderr?.on('data', onData);

const timeout = setTimeout(() => {
  if (!started) {
    child.kill('SIGKILL');
    console.error(out || 'start:protocol did not start within timeout');
    process.exit(1);
  }
}, 10000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  if (!started) {
    console.error(out);
    process.exit(code ?? 1);
  }
  process.exit(0);
});
