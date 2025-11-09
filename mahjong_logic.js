// 台灣麻將邏輯處理模組

// 牌的花色和數值解析
function parseTile(tileName) {
  // 中文數字轉換
  const chineseToNumber = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9
  };

  // 萬子
  if (tileName.includes('萬')) {
    const valueStr = tileName.charAt(0);
    const value = chineseToNumber[valueStr] || parseInt(valueStr);
    return { suit: 'character', value: value };
  }
  // 筒子
  if (tileName.includes('筒')) {
    const valueStr = tileName.charAt(0);
    const value = chineseToNumber[valueStr] || parseInt(valueStr);
    return { suit: 'dot', value: value };
  }
  // 條子
  if (tileName.includes('條')) {
    const valueStr = tileName.charAt(0);
    const value = chineseToNumber[valueStr] || parseInt(valueStr);
    return { suit: 'bamboo', value: value };
  }
  // 風牌
  const windMap = { '東': 1, '南': 2, '西': 3, '北': 4 };
  if (windMap[tileName] !== undefined) {
    return { suit: 'wind', value: windMap[tileName] };
  }
  // 三元牌
  const dragonMap = { '中': 1, '發': 2, '白': 3 };
  if (dragonMap[tileName] !== undefined) {
    return { suit: 'dragon', value: dragonMap[tileName] };
  }
  // 花牌
  const flowerMap = { '春': 1, '夏': 2, '秋': 3, '冬': 4, '梅': 5, '蘭': 6, '竹': 7, '菊': 8 };
  if (flowerMap[tileName] !== undefined) {
    return { suit: 'flower', value: flowerMap[tileName] };
  }

  return null;
}

// 檢查是否為花牌
function isFlowerTile(tileName) {
  const parsed = parseTile(tileName);
  return parsed && parsed.suit === 'flower';
}

// 檢查是否為數字牌（萬筒條）
function isNumberTile(tileName) {
  const parsed = parseTile(tileName);
  return parsed && ['character', 'dot', 'bamboo'].includes(parsed.suit);
}

// 檢查兩張牌是否相同
function isSameTile(tile1, tile2) {
  const parsed1 = parseTile(tile1);
  const parsed2 = parseTile(tile2);
  return parsed1 && parsed2 &&
    parsed1.suit === parsed2.suit &&
    parsed1.value === parsed2.value;
}

// 檢查是否為連續牌（順子）
function isConsecutive(tile1, tile2, tile3) {
  const parsed1 = parseTile(tile1);
  const parsed2 = parseTile(tile2);
  const parsed3 = parseTile(tile3);

  if (!parsed1 || !parsed2 || !parsed3) return false;

  // 必須同花色且為數字牌
  if (parsed1.suit !== parsed2.suit || parsed2.suit !== parsed3.suit) return false;
  if (!['character', 'dot', 'bamboo'].includes(parsed1.suit)) return false;

  // 檢查是否連續
  const values = [parsed1.value, parsed2.value, parsed3.value].sort((a, b) => a - b);
  return values[1] === values[0] + 1 && values[2] === values[1] + 1;
}

// 統計手牌中每種牌的數量
function countTiles(hand) {
  const counts = {};
  hand.forEach(tile => {
    const key = tile;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// 檢查是否能胡牌
// [hand] 手牌（暗牌）
// [newTile] 新摸入或別人打出的牌
// [exposedMelds] 明牌數量（吃碰槓的牌組數量，預設0）
function canHu(hand, newTile, exposedMelds = 0) {
  const allTiles = [...hand, newTile];
  
  // 調試日誌
  console.log(`    [canHu] 手牌數量：${hand.length}，目標牌：${newTile}，明牌組數：${exposedMelds}，總牌數：${allTiles.length}`);

  // 檢查七對子（只有沒有明牌時才能七對子）
  if (exposedMelds === 0 && isSevenPairs(allTiles)) {
    console.log(`    [canHu] 七對子檢測通過`);
    return true;
  }

  // 檢查標準胡牌（台灣麻將：5組面子 + 1對將）
  // 已經有 exposedMelds 組明牌，還需要 5 - exposedMelds 組面子
  const remainingMeldsNeeded = 5 - exposedMelds;
  console.log(`    [canHu] 需要組成${remainingMeldsNeeded}組面子`);
  const result = checkStandardHu(allTiles, remainingMeldsNeeded);
  console.log(`    [canHu] checkStandardHu結果：${result}`);
  return result;
}

// 檢查七對子
function isSevenPairs(tiles) {
  if (tiles.length !== 17) return false;

  const counts = countTiles(tiles);
  let pairCount = 0;
  let singleCount = 0;

  for (const count of Object.values(counts)) {
    if (count === 2) {
      pairCount++;
    } else if (count === 1) {
      singleCount++;
    } else if (count === 4) {
      pairCount += 2;
    } else {
      return false;
    }
  }

  return pairCount === 8 && singleCount === 1;
}

// 檢查標準胡牌
function checkStandardHu(tiles, meldsNeeded) {
  console.log(`      [checkStandardHu] tiles數量：${tiles.length}，需要面子數：${meldsNeeded}`);
  console.log(`      [checkStandardHu] tiles：${tiles.join(',')}`);
  if (meldsNeeded === 0) {
    const result = tiles.length === 2 && isPair(tiles);
    console.log(`      [checkStandardHu] meldsNeeded=0，結果：${result}`);
    return result;
  }

  const expectedTiles = meldsNeeded * 3 + 2;
  console.log(`      [checkStandardHu] 預期牌數：${expectedTiles}，實際牌數：${tiles.length}`);
  if (tiles.length !== expectedTiles) {
    console.log(`      [checkStandardHu] 牌數不符合，返回false`);
    return false;
  }

  // 嘗試所有可能的將牌組合
  let pairCount = 0;
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (isSameTile(tiles[i], tiles[j])) {
        pairCount++;
        console.log(`      [checkStandardHu] 嘗試將牌對：${tiles[i]}和${tiles[j]}（第${pairCount}對）`);
        const remainingTiles = [...tiles];
        remainingTiles.splice(j, 1);
        remainingTiles.splice(i, 1);
        console.log(`      [checkStandardHu] 移除將牌後剩餘：${remainingTiles.join(',')}，數量：${remainingTiles.length}`);

        const canForm = canFormMelds(remainingTiles, meldsNeeded);
        console.log(`      [checkStandardHu] canFormMelds結果：${canForm}`);
        if (canForm) {
          console.log(`      [checkStandardHu] ✓ 找到有效胡牌組合！`);
          return true;
        }
      }
    }
  }

  console.log(`      [checkStandardHu] ✗ 嘗試了${pairCount}對將牌，都無法組成有效胡牌`);
  return false;
}

// 檢查是否能組成指定數量的面子
function canFormMelds(tiles, meldsNeeded) {
  console.log(`        [canFormMelds] 開始檢查，tiles數量：${tiles.length}，需要面子數：${meldsNeeded}`);
  if (tiles.length === 0 && meldsNeeded === 0) {
    console.log(`        [canFormMelds] 基礎情況：無剩餘牌且不需要面子，返回true`);
    return true;
  }
  if (tiles.length === 0 || meldsNeeded === 0) {
    console.log(`        [canFormMelds] 基礎情況不符，返回false`);
    return false;
  }
  if (tiles.length !== meldsNeeded * 3) {
    console.log(`        [canFormMelds] 牌數不符：${tiles.length} != ${meldsNeeded * 3}，返回false`);
    return false;
  }

  console.log(`        [canFormMelds] 牌組：${tiles.join(',')}`);
  const result = findMeldsRecursive(tiles, 0, meldsNeeded);
  console.log(`        [canFormMelds] 遞迴結果：${result}`);
  return result;
}

// 遞迴尋找面子組合
function findMeldsRecursive(tiles, foundMelds, targetMelds) {
  const indent = '          '.repeat(foundMelds);
  console.log(`${indent}[findMeldsRecursive] 深度${foundMelds}/${targetMelds}，剩餘牌數：${tiles.length}，牌組：${tiles.slice(0, 10).join(',')}${tiles.length > 10 ? '...' : ''}`);
  
  if (foundMelds === targetMelds && tiles.length === 0) {
    console.log(`${indent}[findMeldsRecursive] ✓ 成功：已找到${targetMelds}組面子，無剩餘牌`);
    return true;
  }
  if (tiles.length === 0) {
    console.log(`${indent}[findMeldsRecursive] ✗ 失敗：無剩餘牌但未完成目標`);
    return false;
  }

  const firstTile = tiles[0];
  console.log(`${indent}[findMeldsRecursive] 當前首張牌：${firstTile}`);

  // 嘗試刻子
  const triplet = findTriplet(tiles, firstTile);
  if (triplet) {
    console.log(`${indent}[findMeldsRecursive] 找到刻子：${triplet.join(',')}`);
    const newTiles = [...tiles];
    triplet.forEach(tile => {
      const index = newTiles.indexOf(tile);
      if (index !== -1) newTiles.splice(index, 1);
    });
    if (findMeldsRecursive(newTiles, foundMelds + 1, targetMelds)) {
      return true;
    }
  } else {
    console.log(`${indent}[findMeldsRecursive] 無法組成刻子`);
  }

  // 嘗試順子
  const sequence = findSequence(tiles, firstTile);
  if (sequence) {
    console.log(`${indent}[findMeldsRecursive] 找到順子：${sequence.join(',')}`);
    const newTiles = [...tiles];
    sequence.forEach(tile => {
      const index = newTiles.indexOf(tile);
      if (index !== -1) newTiles.splice(index, 1);
    });
    if (findMeldsRecursive(newTiles, foundMelds + 1, targetMelds)) {
      return true;
    }
  } else {
    console.log(`${indent}[findMeldsRecursive] 無法組成順子`);
  }

  console.log(`${indent}[findMeldsRecursive] ✗ 無法從當前牌組找到有效面子`);
  return false;
}

// 尋找刻子
function findTriplet(tiles, target) {
  const matching = tiles.filter(tile => isSameTile(tile, target));
  return matching.length >= 3 ? matching.slice(0, 3) : null;
}

// 尋找順子（包含目標牌的所有可能順子組合）
function findSequence(tiles, target) {
  const parsed = parseTile(target);
  if (!parsed || !['character', 'dot', 'bamboo'].includes(parsed.suit)) {
    return null;
  }

  const value = parsed.value;
  const suit = parsed.suit;

  // 嘗試三種可能的順子組合：
  // 1. [value-2, value-1, value] - 目標牌是第三張
  // 2. [value-1, value, value+1] - 目標牌是中間
  // 3. [value, value+1, value+2] - 目標牌是第一張

  // 組合1: [value-2, value-1, value]
  if (value >= 3) {
    const tile1 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value - 2;
    });
    const tile2 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value - 1;
    });
    if (tile1 && tile2) {
      return [tile1, tile2, target];
    }
  }

  // 組合2: [value-1, value, value+1]
  if (value >= 2 && value <= 8) {
    const tile1 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value - 1;
    });
    const tile2 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value + 1;
    });
    if (tile1 && tile2) {
      return [tile1, target, tile2];
    }
  }

  // 組合3: [value, value+1, value+2]
  if (value <= 7) {
    const tile2 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value + 1;
    });
    const tile3 = tiles.find(tile => {
      const p = parseTile(tile);
      return p && p.suit === suit && p.value === value + 2;
    });
    if (tile2 && tile3) {
      return [target, tile2, tile3];
    }
  }

  return null;
}

// 檢查是否為對子
function isPair(tiles) {
  return tiles.length === 2 && isSameTile(tiles[0], tiles[1]);
}

// 檢查是否能吃牌
function canChi(playerHand, discardedTile, discardingPlayer, currentPlayer) {
  // 只有上家可以吃
  if ((discardingPlayer + 1) % 4 !== currentPlayer) {
    return [];
  }

  // 只有數字牌可以吃
  if (!isNumberTile(discardedTile)) {
    return [];
  }

  const parsed = parseTile(discardedTile);
  if (!parsed) return [];

  const combinations = [];
  const value = parsed.value;

  // 組合1: [value-2, value-1] + discarded
  if (value >= 3) {
    const tile1 = findTileInHand(playerHand, parsed.suit, value - 2);
    const tile2 = findTileInHand(playerHand, parsed.suit, value - 1);
    if (tile1 && tile2) {
      combinations.push([tile1, tile2, discardedTile]);
    }
  }

  // 組合2: [value-1, value+1] + discarded
  if (value >= 2 && value <= 8) {
    const tile1 = findTileInHand(playerHand, parsed.suit, value - 1);
    const tile2 = findTileInHand(playerHand, parsed.suit, value + 1);
    if (tile1 && tile2) {
      combinations.push([tile1, discardedTile, tile2]);
    }
  }

  // 組合3: [value+1, value+2] + discarded
  if (value <= 7) {
    const tile1 = findTileInHand(playerHand, parsed.suit, value + 1);
    const tile2 = findTileInHand(playerHand, parsed.suit, value + 2);
    if (tile1 && tile2) {
      combinations.push([discardedTile, tile1, tile2]);
    }
  }

  return combinations;
}

// 檢查是否能碰牌
function canPong(playerHand, discardedTile) {
  const matchingCount = playerHand.filter(tile => isSameTile(tile, discardedTile)).length;
  return matchingCount >= 2;
}

// 檢查是否能槓牌
function canKong(playerHand, discardedTile) {
  const matchingCount = playerHand.filter(tile => isSameTile(tile, discardedTile)).length;
  return matchingCount >= 3;
}

// 檢查是否能自槓
function canSelfKong(playerHand, newTile) {
  const allTiles = [...playerHand, newTile];
  const counts = countTiles(allTiles);
  return Object.values(counts).some(count => count === 4);
}

// 從手牌中找指定花色的牌
function findTileInHand(hand, suit, value) {
  return hand.find(tile => {
    const parsed = parseTile(tile);
    return parsed && parsed.suit === suit && parsed.value === value;
  });
}

// 檢查所有吃碰槓選項
function checkAllClaims(playerHand, discardedTile, discardingPlayer, currentPlayer) {
  const claims = [];

  // 檢查吃牌
  const chiCombinations = canChi(playerHand, discardedTile, discardingPlayer, currentPlayer);
  chiCombinations.forEach(combination => {
    claims.push({
      type: 'chi',
      tiles: combination,
      targetTile: discardedTile
    });
  });

  // 檢查碰牌
  if (canPong(playerHand, discardedTile)) {
    const matchingTiles = playerHand.filter(tile => isSameTile(tile, discardedTile)).slice(0, 2);
    claims.push({
      type: 'pong',
      tiles: [...matchingTiles, discardedTile],
      targetTile: discardedTile
    });
  }

  // 檢查槓牌
  if (canKong(playerHand, discardedTile)) {
    const matchingTiles = playerHand.filter(tile => isSameTile(tile, discardedTile)).slice(0, 3);
    claims.push({
      type: 'kong',
      tiles: [...matchingTiles, discardedTile],
      targetTile: discardedTile
    });
  }

  return claims;
}

// 檢查是否能聽牌（差一張牌就能胡）
// [hand] 手牌（暗牌）
// [exposedMelds] 明牌數量（吃碰槓的牌組數量，預設0）
// 返回是否能聽牌
function canTing(hand, exposedMelds = 0) {
  // 定義所有可能的牌（不包括花牌）
  const allPossibleTiles = [
    // 萬子
    '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬',
    // 筒子
    '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒',
    // 條子
    '一條', '二條', '三條', '四條', '五條', '六條', '七條', '八條', '九條',
    // 風牌
    '東', '南', '西', '北',
    // 三元牌
    '中', '發', '白'
  ];
  
  // 檢查每一張牌是否能讓手牌胡牌
  for (const tile of allPossibleTiles) {
    if (canHu(hand, tile, exposedMelds)) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  parseTile,
  isFlowerTile,
  isNumberTile,
  isSameTile,
  isConsecutive,
  countTiles,
  canHu,
  canTing,
  isSevenPairs,
  checkStandardHu,
  canFormMelds,
  findMeldsRecursive,
  findTriplet,
  findSequence,
  isPair,
  canChi,
  canPong,
  canKong,
  canSelfKong,
  findTileInHand,
  checkAllClaims
};
