const { tables, getCleanTableData, safeEmit } = require('./gameState');
const { GamePhase } = require('./constants');
const { nextTurn } = require('./gameFlow');

// 處理玩家斷線
function handlePlayerDisconnect(tableId, playerId, socketId) {
  const table = tables[tableId];
  if (!table) {
    console.log(`房間 ${tableId} 不存在`);
    return;
  }
  
  console.log(`處理玩家離開：房間 ${tableId}，玩家 ${playerId}`);
  
  // 找出玩家索引
  const playerIndex = table.players.findIndex(p => p.id === playerId);
  
  if (playerIndex === -1) {
    console.log(`玩家 ${playerId} 不在房間 ${tableId} 中`);
    return;
  }
  
  // 清除所有與該玩家相關的計時器
  if (table.claimingState && table.claimingState.options) {
    const playerOption = table.claimingState.options.find(opt => opt.playerId === playerId);
    if (playerOption) {
      // 如果該玩家正在等待吃碰槓，移除該選項
      table.claimingState.options = table.claimingState.options.filter(opt => opt.playerId !== playerId);
      
      // 如果沒有其他選項了，清除吃碰槓狀態
      if (table.claimingState.options.length === 0) {
        if (table.claimingTimer) {
          clearInterval(table.claimingTimer);
          table.claimingTimer = null;
        }
        table.claimingState = null;
        table.gamePhase = GamePhase.PLAYING;
      }
    }
  }
  
  // 清除聽牌狀態（如果該玩家正在聽牌）
  if (table.tingState && table.tingState.playerId === playerId) {
    if (table.tingTimer) {
      clearInterval(table.tingTimer);
      table.tingTimer = null;
    }
    table.tingState = null;
    table.gamePhase = GamePhase.PLAYING;
  }
  
  // 清除回合計時器（如果該玩家是當前回合）
  if (table.turn === playerIndex && table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }
  
  // 從玩家列表中移除
  table.players = table.players.filter(p => p.id !== playerId);
  
  // 清理玩家相關數據
  delete table.hands[playerId];
  delete table.hiddenHands[playerId];
  delete table.melds[playerId];
  delete table.discards[playerId];
  delete table.flowers[playerId];
  
  // 如果房間空了，刪除房間
  if (table.players.length === 0) {
    console.log(`房間 ${tableId} 已空，刪除房間`);
    delete tables[tableId];
    return;
  }
  
  // 如果遊戲正在進行，需要處理玩家離開的情況
  if (table.gamePhase === GamePhase.PLAYING || table.gamePhase === GamePhase.CLAIMING) {
    // 如果離開的是當前玩家，輪到下一家
    if (table.turn === playerIndex) {
      console.log(`當前玩家離開，輪到下一家`);
      // 確保下一個玩家索引有效
      if (table.players.length > 0) {
        // 重新計算 turn（因為玩家列表已更新）
        const newTurnIndex = table.turn % table.players.length;
        table.turn = newTurnIndex;
        nextTurn(tableId);
      }
    } else {
      // 更新 turn 索引（因為玩家列表已更新）
      const oldTurn = table.turn;
      if (playerIndex < oldTurn) {
        table.turn = oldTurn - 1;
      }
    }
  }
  
  // 廣播玩家離開
  safeEmit(tableId, 'playerLeft', {
    playerId: playerId,
    remainingPlayers: table.players.length
  });
  
  // 發送更新後的房間狀態
  const cleanTableData = getCleanTableData(table);
  if (cleanTableData) {
    safeEmit(tableId, 'tableUpdate', cleanTableData);
  }
}

// 結束遊戲
function endGame(tableId, reason, scores = null) {
  const table = tables[tableId];
  if (!table) return;
  
  table.gamePhase = GamePhase.ENDED;
  
  console.log(`遊戲結束 - 房間: ${tableId}, 原因: ${reason}`);
  
  // 清除所有計時器
  if (table.claimingTimer) {
    clearInterval(table.claimingTimer);
    table.claimingTimer = null;
    console.log('>>> 清除吃碰槓計時器');
  }
  
  if (table.tingTimer) {
    clearInterval(table.tingTimer);
    table.tingTimer = null;
    console.log('>>> 清除聽牌計時器');
  }
  
  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
    console.log('>>> 清除回合計時器');
  }
  
  // 清除所有等待狀態
  table.claimingState = null;
  table.tingState = null;
  table.initialTingState = null;
  
  // 更新玩家分數（如果有提供）
  if (scores) {
    Object.keys(scores).forEach(playerId => {
      const player = table.players.find(p => p.id === playerId);
      if (player) {
        player.score += scores[playerId];
      }
    });
  }
  
  // 廣播遊戲結束（包含天聽信息）
  console.log('>>> [結算] 準備廣播遊戲結束，檢查天聽玩家：');
  const playersWithTianTing = table.players.map(p => ({
    id: p.id,
    score: p.score,
    isTianTing: p.isTianTing || false // 是否為天聽
  }));
  
  playersWithTianTing.forEach((p, index) => {
    console.log(`>>> [結算] 玩家${index + 1} (ID: ${p.id}): isTianTing = ${p.isTianTing}`);
  });
  
  safeEmit(tableId, 'gameEnd', {
    reason: reason,
    players: playersWithTianTing,
    finalScores: table.players.map(p => ({ id: p.id, score: p.score }))
  });
}

module.exports = {
  handlePlayerDisconnect,
  endGame
};

