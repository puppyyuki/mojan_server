/**
 * CORS 配置
 * 統一管理跨域資源共享設定
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://mojan-app.onrender.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
];

function parseAllowedOrigins() {
  const raw = (process.env.CORS_ORIGIN || '').trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const allowedOrigins = parseAllowedOrigins();

function isAllowedOrigin(origin) {
  if (!origin) return true; // 非瀏覽器請求（如 curl / server-to-server）
  if (allowedOrigins.includes('*')) return true;
  if (allowedOrigins.includes(origin)) return true;

  // Render 預覽/別名網址：mojan-app(-anything).onrender.com
  if (/^https:\/\/mojan-app(?:-[a-z0-9-]+)?\.onrender\.com$/i.test(origin)) {
    return true;
  }
  return false;
}

module.exports = {
  // CORS 來源設定：支援逗號分隔與動態驗證
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked origin: ${origin}`));
  },

  // 允許的方法
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // 允許的標頭
  allowedHeaders: ['Content-Type', 'Authorization'],

  // 是否允許憑證
  credentials: true,

  // 預檢請求快取時間（秒）
  maxAge: 86400, // 24 小時
};

