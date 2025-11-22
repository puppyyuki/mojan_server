/**
 * Socket.IO 配置
 * 統一管理 Socket.IO 設定
 */

const corsConfig = require('./cors');

module.exports = {
  cors: {
    origin: corsConfig.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  
  // 連接超時設定
  pingTimeout: 60000,
  pingInterval: 25000,
  
  // 允許的傳輸方式
  transports: ['websocket', 'polling'],
};

