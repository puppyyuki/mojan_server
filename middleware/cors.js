/**
 * CORS 中間件
 * 統一處理跨域請求
 */

const corsConfig = require('../config/cors');
const cors = require('cors');
const corsDebugEnabled = (process.env.CORS_DEBUG || '').toLowerCase() === 'true';

// 創建 CORS 中間件
const corsMiddleware = cors({
  origin: corsConfig.origin,
  methods: corsConfig.methods,
  allowedHeaders: corsConfig.allowedHeaders,
  credentials: corsConfig.credentials,
  maxAge: corsConfig.maxAge,
});

module.exports = (req, res, next) => {
  const origin = req.headers.origin || '-';
  if (corsDebugEnabled) {
    console.log(`[CORS] incoming ${req.method} ${req.originalUrl} origin=${origin}`);
  }
  corsMiddleware(req, res, (err) => {
    if (corsDebugEnabled) {
      if (err) {
        console.warn(
          `[CORS] blocked ${req.method} ${req.originalUrl} origin=${origin} reason=${err.message}`
        );
      } else {
        const allowedOrigin = res.getHeader('Access-Control-Allow-Origin') || '-';
        console.log(
          `[CORS] allowed ${req.method} ${req.originalUrl} origin=${origin} allowOrigin=${allowedOrigin}`
        );
      }
    }
    next(err);
  });
};

