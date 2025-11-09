const { GamePhase } = require('./constants');

let tables = {}; // 完整的遊戲狀態
const socketToPlayer = {}; // socket.id 到 {tableId, playerId} 的映射
const nicknameToPlayerId = {}; // 暱稱到玩家ID的映射（用於綁定暱稱和ID）

let io = null; // Socket.IO 實例（將在 server.js 中設置）

// 設置 Socket.IO 實例
function setIO(ioInstance) {
  io = ioInstance;
}

// 清理資料，確保可序列化（移除函數、循環引用等）
function getCleanTableData(table) {
  if (!table) return null;
  
  try {
    // 創建一個純資料的副本
    const cleanData = {
      id: table.id,
      players: table.players ? table.players.map(p => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        isDealer: p.isDealer,
        score: p.score,
        isReady: p.isReady,
        isTing: p.isTing || false,
        isTianTing: p.isTianTing || false
      })) : [],
      hands: table.hands || {},
      // hiddenHands 不應該發送給所有玩家，只發送給自己
      // hiddenHands: table.hiddenHands || {},
      melds: table.melds || {},
      discards: table.discards || {},
      flowers: table.flowers || {},
      deck: table.deck || [],
      turn: table.turn,
      windStart: table.windStart,
      dealerIndex: table.dealerIndex,
      lastDiscard: table.lastDiscard,
      gamePhase: table.gamePhase,
      timer: table.timer,
      started: table.started,
      countdownStarted: table.countdownStarted,
      round: table.round,
      wind: table.wind
    };
    
    return cleanData;
  } catch (error) {
    console.error('清理資料時發生錯誤:', error);
    return null;
  }
}

// 安全地發送資料（包含錯誤處理）
function safeEmit(room, event, data) {
  if (!io) {
    console.error('Socket.IO 實例未設置，無法發送資料');
    return;
  }
  
  try {
    // 如果資料是 table 物件，先清理
    if (data && typeof data === 'object' && data.id && data.players) {
      data = getCleanTableData(data);
    }
    
    if (data === null || data === undefined) {
      console.warn(`嘗試發送 null/undefined 資料到 ${event}`);
      return;
    }
    
    io.to(room).emit(event, data);
  } catch (error) {
    console.error(`發送資料到 ${event} 時發生錯誤:`, error);
    // 不拋出錯誤，避免伺服器崩潰
  }
}

module.exports = {
  tables,
  socketToPlayer,
  nicknameToPlayerId,
  setIO,
  getCleanTableData,
  safeEmit
};

