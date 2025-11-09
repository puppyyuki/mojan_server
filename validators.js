const mahjongLogic = require('./mahjong_logic');

// 胡牌檢測（考慮明牌數量）
function canHu(hand, tile, exposedMelds = 0) {
  return mahjongLogic.canHu(hand, tile, exposedMelds);
}

// 聽牌檢測（考慮明牌數量）
function canTing(hand, exposedMelds = 0) {
  return mahjongLogic.canTing(hand, exposedMelds);
}

// 槓牌檢測
function canKong(hand, tile) {
  return mahjongLogic.canKong(hand, tile);
}

// 碰牌檢測
function canPong(hand, tile) {
  return mahjongLogic.canPong(hand, tile);
}

// 吃牌檢測
function canChi(hand, tile, discardingPlayer, currentPlayer) {
  const combinations = mahjongLogic.canChi(hand, tile, discardingPlayer, currentPlayer);
  return combinations.length > 0;
}

// 自槓檢測
function canSelfKong(hand, newTile) {
  return mahjongLogic.canSelfKong(hand, newTile);
}

module.exports = {
  canHu,
  canTing,
  canKong,
  canPong,
  canChi,
  canSelfKong
};

