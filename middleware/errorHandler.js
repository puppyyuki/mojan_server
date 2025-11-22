/**
 * 統一錯誤處理中間件
 */

function errorHandler(err, req, res, next) {
  console.error('錯誤:', err);

  // 預設錯誤響應
  const status = err.status || err.statusCode || 500;
  const message = err.message || '伺服器內部錯誤';

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = errorHandler;

