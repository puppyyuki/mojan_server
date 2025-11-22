/**
 * ID 生成工具
 */

/**
 * 生成唯一的 ID
 * @param {Function} checkUnique - 檢查 ID 是否唯一的函數，返回 Promise<boolean>
 * @returns {Promise<string>} 唯一的 ID
 */
async function generateUniqueId(checkUnique) {
  for (let i = 0; i < 100; i++) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    const isUnique = await checkUnique(id);
    if (isUnique) {
      return id;
    }
  }
  throw new Error('無法生成唯一ID，請重試');
}

module.exports = {
  generateUniqueId,
};

