/**
 * 測試模式處理
 * 處理各種測試房間的特殊邏輯
 */

const { allTiles } = require('./constants');
const mahjongLogic = require('../mahjong_logic');

/**
 * 檢查是否為測試房間
 */
function isTestRoom(tableId) {
  return ['777777', '222222', '888888', '666666', '555555'].includes(tableId);
}

/**
 * 應用測試模式到遊戲
 * @param {string} tableId - 房間ID
 * @param {Object} table - 遊戲桌物件
 * @param {Array} shuffledTiles - 洗牌後的牌組
 */
function applyTestMode(tableId, table, shuffledTiles) {
  if (tableId === '777777') {
    return applyTestMode777777(table, shuffledTiles);
  } else if (tableId === '222222') {
    return applyTestMode222222(table, shuffledTiles);
  } else if (tableId === '888888') {
    return applyTestMode888888(table, shuffledTiles);
  } else if (tableId === '666666') {
    return applyTestMode666666(table, shuffledTiles);
  } else if (tableId === '555555') {
    return applyTestMode555555(table, shuffledTiles);
  }
  return null; // 不是測試模式
}

/**
 * 測試模式 777777：給玩家1發3張相同牌，且第一次摸牌會摸到第4張
 */
function applyTestMode777777(table, shuffledTiles) {
  console.log('>>> 測試模式：房間號 777777，給玩家1發3張相同牌，且第一次摸牌會摸到第4張');
  
  // 強制玩家1成為莊家
  table.dealerIndex = 0;
  table.windStart = 0;
  table.turn = 0;
  table.players.forEach((player, index) => {
    player.isDealer = (index === 0);
  });
  
  // 定義測試手牌：玩家1有3張南風 + 其他13張牌
  const testKongHand = [
    '南', '南', '南',
    '一萬', '二萬', '三萬',
    '四萬', '五萬', '六萬',
    '七萬', '八萬', '九萬',
    '一筒', '二筒', '三筒',
    '一筒'
  ];
  
  // 從牌組中移除測試手牌所需的牌，並保留南風
  const reservedSouthTiles = [];
  const tilesForDealing = [];
  const tileCounts = {};
  
  testKongHand.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });
  
  shuffledTiles.forEach(tile => {
    if (tile === '南') {
      reservedSouthTiles.push(tile);
    } else if (tileCounts[tile] && tileCounts[tile] > 0) {
      tileCounts[tile]--;
    } else {
      tilesForDealing.push(tile);
    }
  });
  
  // 給玩家發牌
  table.players.forEach((player, playerIndex) => {
    if (playerIndex === 0) {
      // 玩家1：發測試手牌
      table.hiddenHands[player.id] = [...testKongHand];
      table.hands[player.id] = [];
    } else {
      // 其他玩家：正常發牌
      const startIndex = (playerIndex - 1) * 16;
      const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = [];
    }
  });
  
  // 將南風放在牌組最前面
  if (reservedSouthTiles.length > 0) {
    table.deck = [reservedSouthTiles[0], ...tilesForDealing.slice(48)];
    if (reservedSouthTiles.length > 1) {
      table.deck.push(...reservedSouthTiles.slice(1));
    }
  } else {
    table.deck = tilesForDealing.slice(48);
  }
  
  // 標記這是777777測試房間
  table.isTestRoom777777 = true;
  
  return table;
}

/**
 * 測試模式 222222：測試補槓功能
 */
function applyTestMode222222(table, shuffledTiles) {
  console.log('>>> 測試模式：房間號 222222，測試補槓功能');
  
  // 強制玩家1成為莊家，玩家2為下一家
  table.dealerIndex = 0;
  table.windStart = 0;
  table.turn = 0;
  table.players.forEach((player, index) => {
    player.isDealer = (index === 0);
  });
  
  // 定義測試手牌：玩家1有3張東風（準備補槓）
  const testKongHand = [
    '東', '東', '東',
    '一萬', '二萬', '三萬',
    '四萬', '五萬', '六萬',
    '七萬', '八萬', '九萬',
    '一筒', '二筒', '三筒',
    '一筒'
  ];
  
  // 從牌組中移除測試手牌所需的牌，並保留東風
  const reservedEastTiles = [];
  const tilesForDealing = [];
  const tileCounts = {};
  
  testKongHand.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });
  
  shuffledTiles.forEach(tile => {
    if (tile === '東') {
      reservedEastTiles.push(tile);
    } else if (tileCounts[tile] && tileCounts[tile] > 0) {
      tileCounts[tile]--;
    } else {
      tilesForDealing.push(tile);
    }
  });
  
  // 給玩家發牌
  table.players.forEach((player, playerIndex) => {
    if (playerIndex === 0) {
      table.hiddenHands[player.id] = [...testKongHand];
      table.hands[player.id] = [];
    } else {
      const startIndex = (playerIndex - 1) * 16;
      const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = [];
    }
  });
  
  // 將東風放在牌組第2個位置（索引1），確保莊家摸第1張後，下一家第一次摸牌會摸到東風
  if (reservedEastTiles.length > 0) {
    if (tilesForDealing.length >= 1) {
      table.deck = [tilesForDealing[0], reservedEastTiles[0], ...tilesForDealing.slice(1, 48)];
      if (reservedEastTiles.length > 1) {
        table.deck.push(...reservedEastTiles.slice(1));
      }
    } else {
      table.deck = [reservedEastTiles[0], ...tilesForDealing];
      if (reservedEastTiles.length > 1) {
        table.deck.push(...reservedEastTiles.slice(1));
      }
    }
  } else {
    table.deck = tilesForDealing.slice(48);
  }
  
  return table;
}

/**
 * 測試模式 888888：給莊家發可聽牌牌型
 */
function applyTestMode888888(table, shuffledTiles) {
  console.log(`>>> 測試模式：房間號 888888，給莊家（玩家${table.dealerIndex + 1}）發可聽牌牌型`);
  
  // 定義可聽牌的手牌
  const testTingHand = [
    '一萬', '二萬', '三萬',
    '四萬', '五萬', '六萬',
    '七萬', '八萬', '九萬',
    '一筒', '二筒', '三筒',
    '四條', '四條',
    '五條', '六條'
  ];
  
  // 從牌組中移除測試手牌所需的牌
  const remainingTiles = [];
  const tileCounts = {};
  
  testTingHand.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });
  
  shuffledTiles.forEach(tile => {
    if (tileCounts[tile] && tileCounts[tile] > 0) {
      tileCounts[tile]--;
    } else {
      remainingTiles.push(tile);
    }
  });
  
  // 給玩家發牌
  table.players.forEach((player, playerIndex) => {
    if (playerIndex === table.dealerIndex) {
      table.hiddenHands[player.id] = [...testTingHand];
      table.hands[player.id] = [];
    } else {
      const otherPlayerIndex = playerIndex < table.dealerIndex ? playerIndex : playerIndex - 1;
      const startIndex = otherPlayerIndex * 16;
      const playerTiles = remainingTiles.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = [];
    }
  });
  
  table.deck = remainingTiles.slice(48);
  
  return table;
}

/**
 * 測試模式 666666：給除了莊家以外的一位玩家發可聽牌牌型
 */
function applyTestMode666666(table, shuffledTiles) {
  console.log(`>>> 測試模式：房間號 666666，給除了莊家（玩家${table.dealerIndex + 1}）以外的一位玩家發可聽牌牌型`);
  
  // 定義可聽牌的手牌
  const testTingHand = [
    '一萬', '二萬', '三萬',
    '四萬', '五萬', '六萬',
    '七萬', '八萬', '九萬',
    '一筒', '二筒', '三筒',
    '四條', '四條',
    '五條', '六條'
  ];
  
  // 從牌組中移除測試手牌所需的牌
  const remainingTiles = [];
  const tileCounts = {};
  
  testTingHand.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });
  
  shuffledTiles.forEach(tile => {
    if (tileCounts[tile] && tileCounts[tile] > 0) {
      tileCounts[tile]--;
    } else {
      remainingTiles.push(tile);
    }
  });
  
  // 選擇一位非莊家玩家
  let testPlayerIndex = -1;
  for (let i = 0; i < table.players.length; i++) {
    if (i !== table.dealerIndex) {
      testPlayerIndex = i;
      break;
    }
  }
  
  if (testPlayerIndex === -1) {
    testPlayerIndex = (table.dealerIndex + 1) % 4;
  }
  
  // 給玩家發牌
  table.players.forEach((player, playerIndex) => {
    if (playerIndex === table.dealerIndex) {
      const dealerStartIndex = 0;
      const dealerTiles = remainingTiles.slice(dealerStartIndex, dealerStartIndex + 16);
      table.hiddenHands[player.id] = dealerTiles;
      table.hands[player.id] = [];
    } else if (playerIndex === testPlayerIndex) {
      table.hiddenHands[player.id] = [...testTingHand];
      table.hands[player.id] = [];
    } else {
      let otherPlayerCount = 0;
      for (let j = 0; j < playerIndex; j++) {
        if (j !== table.dealerIndex && j !== testPlayerIndex) {
          otherPlayerCount++;
        }
      }
      const startIndex = 16 + (otherPlayerCount * 16);
      const playerTiles = remainingTiles.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = [];
    }
  });
  
  table.deck = remainingTiles.slice(48);
  
  return table;
}

/**
 * 測試模式 555555：給玩家1發可聽牌牌型，且第一張摸牌就能胡
 */
function applyTestMode555555(table, shuffledTiles) {
  console.log('>>> 測試模式：房間號 555555，給玩家1發可聽牌牌型，且第一張摸牌就能胡');
  
  // 強制玩家1成為莊家
  table.dealerIndex = 0;
  table.windStart = 0;
  table.turn = 0;
  table.players.forEach((player, index) => {
    player.isDealer = (index === 0);
  });
  
  // 定義可聽牌的手牌
  const testTingHand = [
    '一萬', '二萬', '三萬',
    '四萬', '五萬', '六萬',
    '七萬', '八萬', '九萬',
    '一筒', '二筒', '三筒',
    '四條', '四條',
    '五條', '六條'
  ];
  
  // 從牌組中移除測試手牌所需的牌，並保留能讓玩家1胡牌的牌
  const reservedHuTiles = [];
  const tilesForDealing = [];
  const tileCounts = {};
  
  testTingHand.forEach(tile => {
    tileCounts[tile] = (tileCounts[tile] || 0) + 1;
  });
  
  shuffledTiles.forEach(tile => {
    if (tile === '四條' || tile === '七條') {
      reservedHuTiles.push(tile);
    } else if (tileCounts[tile] && tileCounts[tile] > 0) {
      tileCounts[tile]--;
    } else {
      tilesForDealing.push(tile);
    }
  });
  
  // 給玩家發牌
  table.players.forEach((player, playerIndex) => {
    if (playerIndex === 0) {
      table.hiddenHands[player.id] = [...testTingHand];
      table.hands[player.id] = [];
    } else {
      const startIndex = (playerIndex - 1) * 16;
      const playerTiles = tilesForDealing.slice(startIndex, startIndex + 16);
      table.hiddenHands[player.id] = playerTiles;
      table.hands[player.id] = [];
    }
  });
  
  // 將能讓玩家1胡牌的牌放在牌組最前面
  if (reservedHuTiles.length > 0) {
    const huTile = reservedHuTiles.find(t => t === '七條') || reservedHuTiles[0];
    table.deck = [huTile, ...tilesForDealing.slice(48)];
    if (reservedHuTiles.length > 1) {
      table.deck.push(...reservedHuTiles.filter(t => t !== huTile));
    }
  } else {
    table.deck = tilesForDealing.slice(48);
  }
  
  return table;
}

module.exports = {
  isTestRoom,
  applyTestMode,
};

