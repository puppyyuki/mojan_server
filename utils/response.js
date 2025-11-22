/**
 * 統一響應格式工具
 */

/**
 * 成功響應
 */
function successResponse(res, data, message = null, statusCode = 200) {
  const response = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  return res.status(statusCode).json(response);
}

/**
 * 錯誤響應
 */
function errorResponse(res, error, message = null, statusCode = 500) {
  const response = {
    success: false,
    error: error || '未知錯誤',
  };
  
  if (message) {
    response.message = message;
  }
  
  return res.status(statusCode).json(response);
}

module.exports = {
  successResponse,
  errorResponse,
};

