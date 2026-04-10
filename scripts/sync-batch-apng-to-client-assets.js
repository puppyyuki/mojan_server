/**
 * 將 mojan_app 的 batch_50ms_apng 複製到 public/client-assets/v1/batch_50ms_apng/
 * 在 mojan_server 目錄執行：node scripts/sync-batch-apng-to-client-assets.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'mojan_app', 'assets', 'batch_50ms_apng');
const dest = path.join(__dirname, '..', 'public', 'client-assets', 'v1', 'batch_50ms_apng');

if (!fs.existsSync(src)) {
  console.error('Source not found:', src);
  process.exit(1);
}
fs.mkdirSync(dest, { recursive: true });
const names = fs.readdirSync(src);
let n = 0;
for (const name of names) {
  const from = path.join(src, name);
  if (!fs.statSync(from).isFile()) continue;
  fs.copyFileSync(from, path.join(dest, name));
  n++;
}
console.log('Copied', n, 'files to', dest);
