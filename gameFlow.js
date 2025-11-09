const { tables, safeEmit } = require('./gameState');
const { GamePhase } = require('./constants');
const { drawTile } = require('./tileActions');

// 輪到下一家
function nextTurn(tableId) {
  const table = tables[tableId];
  if (!table) {
    console.log(`房間 ${tableId} 不存在，無法輪到下一家`);
    return;
  }
  
  // 檢查遊戲是否已結束
  if (table.gamePhase === GamePhase.ENDED) {
    console.log('>>> 遊戲已結束，無法輪到下一家');
    return;
  }
  
  // 檢查是否還有玩家
  if (table.players.length === 0) {
    console.log('房間已無玩家，無法輪到下一家');
    return;
  }
  
  // 清除回合計時器
  if (table.turnTimer) {
    clearInterval(table.turnTimer);
    table.turnTimer = null;
  }
  
  // 確保 turn 索引有效
  if (table.turn >= table.players.length) {
    table.turn = 0;
  }
  
  table.turn = (table.turn + 1) % table.players.length;
  
  // 確保下一個玩家存在
  if (table.turn >= table.players.length || !table.players[table.turn]) {
    console.log(`錯誤：下一個玩家索引 ${table.turn} 無效`);
    return;
  }
  
  const nextPlayer = table.players[table.turn];
  console.log(`輪到玩家${table.turn + 1} (${nextPlayer.name || nextPlayer.id})`);
  
  // 廣播輪次更新
  safeEmit(tableId, 'turnUpdate', {
    turn: table.turn,
    playerId: nextPlayer.id
  });
  
  // 下一家摸牌
  setTimeout(() => {
    // 再次檢查玩家是否仍然存在
    const currentTable = tables[tableId];
    if (currentTable && currentTable.players[table.turn] && currentTable.players[table.turn].id === nextPlayer.id) {
      drawTile(tableId, nextPlayer.id);
    } else {
      console.log(`玩家 ${nextPlayer.id} 已離開，跳過摸牌`);
    }
  }, 1000);
}

module.exports = {
  nextTurn
};

