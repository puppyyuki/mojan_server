/**
 * 房間管理器
 * 管理遊戲房間狀態和玩家映射
 */

let tables = {}; // 完整的遊戲狀態
const socketToPlayer = {}; // socket.id 到 {tableId, playerId} 的映射
const nicknameToPlayerId = {}; // 暱稱到玩家ID的映射（用於綁定暱稱和ID）

module.exports = {
  tables,
  socketToPlayer,
  nicknameToPlayerId,
  
  // 獲取房間
  getTable(tableId) {
    return tables[tableId];
  },
  
  // 設置房間
  setTable(tableId, table) {
    tables[tableId] = table;
  },
  
  // 刪除房間
  deleteTable(tableId) {
    delete tables[tableId];
  },
  
  // 獲取玩家映射
  getPlayerMapping(socketId) {
    return socketToPlayer[socketId];
  },
  
  // 設置玩家映射
  setPlayerMapping(socketId, mapping) {
    socketToPlayer[socketId] = mapping;
  },
  
  // 刪除玩家映射
  deletePlayerMapping(socketId) {
    delete socketToPlayer[socketId];
  },
  
  // 獲取暱稱映射
  getNicknameMapping(nickname) {
    return nicknameToPlayerId[nickname];
  },
  
  // 設置暱稱映射
  setNicknameMapping(nickname, playerId) {
    nicknameToPlayerId[nickname] = playerId;
  },
};

