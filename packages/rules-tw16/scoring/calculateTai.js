function calculateTai(table, player, playerIndex, huType, winningTile) {
  const hand = table.hiddenHands[player.id] || [];
  const melds = table.melds[player.id] || [];
  const hasNoMelds = melds.length === 0;
  const isSelfDrawnHu = huType === 'selfDrawnHu';
  const isDealer = player.isDealer || false;

  let totalTai = 0;
  const patterns = [];
  const patternNames = [];

  const tilesForTai = [...hand];
  if (!isSelfDrawnHu && winningTile) {
    tilesForTai.push(winningTile);
  }

  const windStart = table.windStart || 0;
  const playerWindIndex = (playerIndex - windStart + 4) % 4;
  const windNames = ['東', '南', '西', '北'];
  const playerWindTile = windNames[playerWindIndex];

  const currentRoundWindIndex = table.wind !== undefined ? table.wind : Math.floor((table.round - 1) / 4) % 4;
  const roundWindTile = windNames[currentRoundWindIndex];

  const windTileCountInHand = tilesForTai.filter(tile => tile === playerWindTile).length;
  const hasWindTileInMelds = melds.some(meld => {
    if (meld.type === 'pong' || meld.type === 'kong') {
      return meld.tiles && meld.tiles.includes(playerWindTile);
    }
    return false;
  });
  if (windTileCountInHand >= 3 || hasWindTileInMelds) {
    totalTai += 1;
    patterns.push('menFengTai');
    patternNames.push('門風台');
  }

  const roundWindTileCountInHand = tilesForTai.filter(tile => tile === roundWindTile).length;
  const hasRoundWindTileInMelds = melds.some(meld => {
    if (meld.type === 'pong' || meld.type === 'kong') {
      return meld.tiles && meld.tiles.includes(roundWindTile);
    }
    return false;
  });
  if (roundWindTileCountInHand >= 3 || hasRoundWindTileInMelds) {
    totalTai += 1;
    patterns.push('quanFengTai');
    patternNames.push('圈風台');
  }

  const dragonTiles = ['中', '發', '白'];
  let sanYuanTaiCount = 0;
  dragonTiles.forEach(dragonTile => {
    const dragonTileCountInHand = tilesForTai.filter(tile => tile === dragonTile).length;
    const hasDragonTileInMelds = melds.some(meld => {
      if (meld.type === 'pong' || meld.type === 'kong') {
        return meld.tiles && meld.tiles.includes(dragonTile);
      }
      return false;
    });
    if (dragonTileCountInHand >= 3 || hasDragonTileInMelds) {
      sanYuanTaiCount++;
    }
  });
  if (sanYuanTaiCount > 0) {
    totalTai += sanYuanTaiCount;
    patterns.push('sanYuanTai');
    patternNames.push(`三元台(${sanYuanTaiCount})`);
  }

  const playerFlowers = table.flowers[player.id] || [];
  const windFlowerMap = {
    0: ['春', '梅'],
    1: ['夏', '蘭'],
    2: ['秋', '菊'],
    3: ['冬', '竹']
  };
  const playerWindFlowers = windFlowerMap[playerWindIndex] || [];
  let flowerTaiCount = 0;
  playerWindFlowers.forEach(flowerTile => {
    if (playerFlowers.includes(flowerTile)) {
      flowerTaiCount++;
    }
  });
  if (flowerTaiCount > 0) {
    totalTai += flowerTaiCount;
    patterns.push('flowerTai');
    patternNames.push(`花牌(${flowerTaiCount})`);
  }

  if (isDealer) {
    totalTai += 1;
    patterns.push('dealer');
    patternNames.push('莊家');
  }

  if (hasNoMelds && isSelfDrawnHu) {
    totalTai += 3;
    patterns.push('menQingSelfDraw');
    patternNames.push('門清自摸');
  } else {
    if (isSelfDrawnHu) {
      totalTai += 1;
      patterns.push('selfDraw');
      patternNames.push('自摸');
    }

    if (hasNoMelds) {
      totalTai += 1;
      patterns.push('menQing');
      patternNames.push('門清');
    }
  }

  if (player.isDuTing) {
    totalTai += 1;
    patterns.push('duTing');
    patternNames.push('獨聽');
  }

  if (player.isQiangGang) {
    totalTai += 1;
    patterns.push('qiangGang');
    patternNames.push('搶槓');
  }

  if (player.isGangShangKaiHua) {
    totalTai += 1;
    patterns.push('gangShangKaiHua');
    patternNames.push('槓上開花');
  }

  if (player.isHaiDiLaoYue) {
    totalTai += 1;
    patterns.push('haiDiLaoYue');
    patternNames.push('海底撈月');
  }

  if (player.isHaiDiLaoYu) {
    totalTai += 1;
    patterns.push('haiDiLaoYu');
    patternNames.push('海底撈魚');
  }

  if (player.isHuaGang) {
    totalTai += 2;
    patterns.push('huaGang');
    patternNames.push('花槓');
  }

  if (player.isQuanQiu) {
    totalTai += 2;
    patterns.push('quanQiu');
    patternNames.push('全求');
  }

  if (player.isSanAnKe) {
    totalTai += 2;
    patterns.push('sanAnKe');
    patternNames.push('三暗刻');
  }

  if (player.isPengPengHu) {
    totalTai += 4;
    patterns.push('pengPengHu');
    patternNames.push('碰碰胡');
  }

  if (player.isHunYiSe) {
    totalTai += 4;
    patterns.push('hunYiSe');
    patternNames.push('混一色');
  }

  if (player.isXiaoSanYuan) {
    totalTai += 4;
    patterns.push('xiaoSanYuan');
    patternNames.push('小三元');
  }

  if (player.isSiAnKe) {
    totalTai += 5;
    patterns.push('siAnKe');
    patternNames.push('四暗刻');
  }

  if (player.isDiTing) {
    totalTai += 8;
    patterns.push('diTing');
    patternNames.push('地聽');
  }

  if (player.isWuAnKe) {
    totalTai += 8;
    patterns.push('wuAnKe');
    patternNames.push('五暗刻');
  }

  if (player.isQingYiSe) {
    totalTai += 8;
    patterns.push('qingYiSe');
    patternNames.push('清一色');
  }

  if (player.isZiYiSe) {
    totalTai += 8;
    patterns.push('ziYiSe');
    patternNames.push('字一色');
  }

  if (player.isDaSanYuan) {
    totalTai += 8;
    patterns.push('daSanYuan');
    patternNames.push('大三元');
  }

  if (player.isXiaoSiXi) {
    totalTai += 8;
    patterns.push('xiaoSiXi');
    patternNames.push('小四喜');
  }

  if (player.isLiGuLiGu) {
    totalTai += 8;
    patterns.push('liGuLiGu');
    patternNames.push('嚦咕嚦咕');
  }

  if (player.isBaXianGuoHai) {
    totalTai += 8;
    patterns.push('baXianGuoHai');
    patternNames.push('八仙過海');
  }

  if (player.isTianTing) {
    totalTai += 16;
    patterns.push('tianTing');
    patternNames.push('天聽');
  }

  if (player.isDaSiXi) {
    totalTai += 16;
    patterns.push('daSiXi');
    patternNames.push('大四喜');
  }

  const pointCap = table.gameSettings?.point_cap || 'UP_TO_8_POINTS';
  let finalTai = totalTai;

  const dealerTai = isDealer ? 1 : 0;
  const patternTai = totalTai - dealerTai;

  if (pointCap === 'UP_TO_4_POINTS') {
    finalTai = dealerTai + Math.min(patternTai, 4);
  } else if (pointCap === 'UP_TO_8_POINTS') {
    finalTai = dealerTai + Math.min(patternTai, 8);
  } else if (pointCap === 'NO_LIMIT' || pointCap === 'UNLIMITED_POINTS' || pointCap === 'UNLIMITED') {
    finalTai = totalTai;
  } else {
    finalTai = dealerTai + Math.min(patternTai, 8);
  }

  return {
    totalTai: finalTai,
    originalTai: totalTai,
    patterns: patterns,
    patternNames: patternNames
  };
}

module.exports = { calculateTai };

