const {
  canHu,
  canTing,
  canChi,
  canPong,
  canKong,
  canSelfKong,
  checkAllClaims
} = require('../../mahjong_logic');
const { calculateTai } = require('./scoring/calculateTai');

module.exports = {
  canHu,
  canTing,
  canChi,
  canPong,
  canKong,
  canSelfKong,
  checkAllClaims,
  calculateTai
};

