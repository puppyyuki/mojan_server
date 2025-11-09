const { tables } = require('./gameState');
const { GamePhase } = require('./constants');
const { safeEmit } = require('./gameState');

// 這些函數定義在 server.js 中
// 注意：由於 server.js 可能引用 timerManager.js，我們使用延遲加載來避免循環依賴
let passClaim, passTing, autoDiscardTile;

function getServerFunctions() {
  if (!passClaim) {
    // 延遲加載，避免循環依賴
    const serverModule = require('./server');
    passClaim = serverModule.passClaim;
    passTing = serverModule.passTing;
    autoDiscardTile = serverModule.autoDiscardTile;
    
    if (!passClaim || !passTing || !autoDiscardTile) {
      console.warn('警告：無法從 server.js 載入函數，請確保 server.js 導出這些函數');
    }
  }
  return { passClaim, passTing, autoDiscardTile };
}

// 開始回合計時
function startTurnTimer(tableId, playerId) {
  const table = tables[tableId];
  if (!table) return;
  
  // 檢查玩家是否仍然存在
  const playerIndex = table.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    console.log(`玩家 ${playerId} 不存在，無法開始回合計時`);
    return;
  }
  
  // 確保 turn 索引正確
  if (table.turn !== playerIndex) {
    table.turn = playerIndex;
  }
  
  console.log(`開始回合計時：玩家${table.turn + 1}，房間${tableId}`);
  
  table.timer = 30; // 30秒倒計時
  
  // 廣播輪次更新
  safeEmit(tableId, 'turnUpdate', {
    turn: table.turn,
    playerId: playerId,
    timeLeft: table.timer
  });
  
  const timerInterval = setInterval(() => {
    // 檢查房間和玩家是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(timerInterval);
      return;
    }
    
    const playerStillExists = currentTable.players.find(p => p.id === playerId);
    if (!playerStillExists) {
      clearInterval(timerInterval);
      currentTable.turnTimer = null;
      console.log(`玩家 ${playerId} 已離開，停止回合計時`);
      return;
    }
    
    currentTable.timer--;
    
    // 廣播倒計時
    safeEmit(tableId, 'timerUpdate', {
      playerId: playerId,
      timeLeft: currentTable.timer
    });
    
    if (currentTable.timer <= 0) {
      clearInterval(timerInterval);
      currentTable.turnTimer = null;
      // 時間到，自動打牌（打第一張牌）
      getServerFunctions().autoDiscardTile(tableId, playerId);
    }
  }, 1000);
  
  // 儲存計時器ID以便清除
  table.turnTimer = timerInterval;
}

// 開始吃碰槓胡倒計時
function startClaimTimer(tableId) {
  const table = tables[tableId];
  if (!table || !table.claimingState) return;
  
  // 檢查遊戲是否已結束
  if (table.gamePhase === GamePhase.ENDED) {
    console.log('>>> 遊戲已結束，無法開始吃碰槓倒計時');
    return;
  }
  
  const claimTimer = setInterval(() => {
    // 檢查房間是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(claimTimer);
      return;
    }
    
    // 檢查遊戲是否已結束
    if (currentTable.gamePhase === GamePhase.ENDED) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      console.log('>>> 遊戲已結束，停止吃碰槓倒計時');
      return;
    }
    
    // 檢查 claimingState 是否仍然存在
    if (!currentTable.claimingState) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      return;
    }
    
    currentTable.claimingState.timer--;
    
    // 廣播倒計時
    safeEmit(tableId, 'claimTimerUpdate', {
      timeLeft: currentTable.claimingState.timer
    });
    
    if (currentTable.claimingState.timer <= 0) {
      clearInterval(claimTimer);
      currentTable.claimingTimer = null;
      // 時間到，自動放棄吃碰槓
      console.log('>>> 吃碰槓超時（30秒），自動放棄');
      getServerFunctions().passClaim(tableId, null);
    }
  }, 1000);
  
  table.claimingTimer = claimTimer;
}

// 開始聽牌倒計時
function startTingTimer(tableId) {
  const table = tables[tableId];
  if (!table || !table.tingState) return;
  
  const tingTimer = setInterval(() => {
    // 檢查房間是否仍然存在
    const currentTable = tables[tableId];
    if (!currentTable) {
      clearInterval(tingTimer);
      return;
    }
    
    // 檢查 tingState 是否仍然存在
    if (!currentTable.tingState) {
      clearInterval(tingTimer);
      currentTable.tingTimer = null;
      return;
    }
    
    currentTable.tingState.timer--;
    
    // 廣播倒計時
    safeEmit(tableId, 'tingTimerUpdate', {
      timeLeft: currentTable.tingState.timer
    });
    
    if (currentTable.tingState.timer <= 0) {
      clearInterval(tingTimer);
      currentTable.tingTimer = null;
      // 時間到，自動放棄聽牌
      console.log('>>> 聽牌超時（30秒），自動放棄');
      getServerFunctions().passTing(tableId, null);
    }
  }, 1000);
  
  table.tingTimer = tingTimer;
}

module.exports = {
  startTurnTimer,
  startClaimTimer,
  startTingTimer
};

