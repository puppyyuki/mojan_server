/**
 * CORS 配置
 * 統一管理跨域資源共享設定
 */

module.exports = {
  // CORS 來源設定
  origin: process.env.CORS_ORIGIN || '*',
  
  // 允許的方法
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // 允許的標頭
  allowedHeaders: ['Content-Type', 'Authorization'],
  
  // 是否允許憑證
  credentials: true,
  
  // 預檢請求快取時間（秒）
  maxAge: 86400, // 24 小時
};

