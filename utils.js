const mahjongLogic = require('./mahjong_logic');

// 洗牌函數
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 檢查是否為花牌
function isFlowerTile(tile) {
  return mahjongLogic.isFlowerTile(tile);
}

// 隨機選擇莊家
function selectRandomDealer() {
  return Math.floor(Math.random() * 4);
}

module.exports = {
  shuffle,
  isFlowerTile,
  selectRandomDealer
};

