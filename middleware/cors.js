/**
 * CORS 中間件
 * 統一處理跨域請求
 */

const corsConfig = require('../config/cors');
const cors = require('cors');

// 創建 CORS 中間件
const corsMiddleware = cors({
  origin: corsConfig.origin,
  methods: corsConfig.methods,
  allowedHeaders: corsConfig.allowedHeaders,
  credentials: corsConfig.credentials,
  maxAge: corsConfig.maxAge,
});

module.exports = corsMiddleware;

