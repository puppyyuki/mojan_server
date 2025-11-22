/**
 * Socket.IO 事件處理器
 * 處理所有 Socket.IO 相關事件
 */

/**
 * 初始化 Socket.IO 處理器
 * @param {Object} io - Socket.IO 實例
 * @param {Object} gameLogic - 遊戲邏輯模組
 * @param {Object} roomManager - 房間管理器
 */
function initializeSocketHandlers(io, gameLogic, roomManager) {
  const { tables, socketToPlayer, nicknameToPlayerId } = roomManager;
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  io.on('connection', (socket) => {
    console.log('有玩家連線', socket.id);

    // 加入房間
    socket.on('joinTable', async ({ tableId, player }) => {
      // 這個邏輯需要從 server.js 遷移
      // 暫時保留在 server.js 中，稍後遷移
    });

    // 摸牌
    socket.on('drawTile', ({ tableId, playerId }) => {
      if (gameLogic.drawTile) {
        gameLogic.drawTile(tableId, playerId);
      }
    });

    // 打牌
    socket.on('discardTile', ({ tableId, playerId, tile }) => {
      if (gameLogic.discardTile) {
        gameLogic.discardTile(tableId, playerId, tile);
      }
    });

    // 吃碰槓請求
    socket.on('claimTile', ({ tableId, playerId, claimType, tiles }) => {
      if (gameLogic.handleClaimRequest) {
        gameLogic.handleClaimRequest(tableId, playerId, claimType, tiles);
      }
    });

    // 執行吃碰槓
    socket.on('executeClaim', ({ tableId, playerId, claimType, tiles, targetPlayer }) => {
      if (gameLogic.executeClaim) {
        gameLogic.executeClaim(tableId, playerId, claimType, tiles);
      }
    });

    // 執行自槓
    socket.on('executeSelfKong', ({ tableId, playerId, tile }) => {
      // 這個邏輯需要從 server.js 遷移
    });

    // 放棄吃碰槓
    socket.on('passClaim', ({ tableId, playerId }) => {
      if (gameLogic.passClaim) {
        gameLogic.passClaim(tableId, playerId);
      }
    });

    // 檢測聽牌
    socket.on('checkTing', ({ tableId, playerId }) => {
      // 這個邏輯需要從 server.js 遷移
    });

    // 宣告聽牌
    socket.on('declareTing', ({ tableId, playerId }) => {
      // 這個邏輯需要從 server.js 遷移
    });

    // 放棄聽牌
    socket.on('passTing', ({ tableId, playerId }) => {
      if (gameLogic.passTing) {
        gameLogic.passTing(tableId, playerId);
      }
    });

    // 宣告胡牌
    socket.on('declareHu', ({ tableId, playerId, huType, targetTile, targetPlayer }) => {
      if (gameLogic.declareHu) {
        gameLogic.declareHu(tableId, playerId, huType, targetTile, targetPlayer);
      }
    });

    // 獲取我的手牌
    socket.on('getMyHand', ({ tableId, playerId }) => {
      const table = tables[tableId];
      if (!table) return;

      const hand = table.hiddenHands[playerId] || [];
      socket.emit('myHand', {
        tableId,
        playerId,
        hand,
      });
    });

    // 離開房間
    socket.on('leaveTable', ({ tableId, playerId }) => {
      if (socketToPlayer[socket.id]) {
        delete socketToPlayer[socket.id];
      }
      socket.leave(tableId);
    });

    // 斷線處理
    socket.on('disconnect', () => {
      console.log('玩家離線', socket.id);

      const playerInfo = socketToPlayer[socket.id];
      if (playerInfo) {
        const { tableId, playerId } = playerInfo;
        const table = tables[tableId];
        
        if (table) {
          // 從房間中移除玩家
          const playerIndex = table.players.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            table.players.splice(playerIndex, 1);
            delete table.hiddenHands[playerId];
            delete table.hands[playerId];
            delete table.melds[playerId];
            
            // 通知其他玩家
            io.to(tableId).emit('playerLeft', {
              playerId,
              playerIndex,
              players: table.players,
            });
          }
        }
        
        delete socketToPlayer[socket.id];
      }
    });
  });
}

module.exports = {
  initializeSocketHandlers,
};

