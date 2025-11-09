// 台灣麻將完整牌組（包含花牌）
const allTiles = [
  // 萬子 (1-9萬) 各4張
  ...Array(4).fill(['一萬','二萬','三萬','四萬','五萬','六萬','七萬','八萬','九萬']).flat(),
  // 筒子 (1-9筒) 各4張
  ...Array(4).fill(['一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒']).flat(),
  // 條子 (1-9條) 各4張
  ...Array(4).fill(['一條','二條','三條','四條','五條','六條','七條','八條','九條']).flat(),
  // 風牌 (東南西北) 各4張
  ...Array(4).fill(['東','南','西','北']).flat(),
  // 三元牌 (中發白) 各4張
  ...Array(4).fill(['中','發','白']).flat(),
  // 花牌 (春夏秋冬梅蘭竹菊) 各1張
  '春','夏','秋','冬','梅','蘭','竹','菊'
];

// 遊戲階段
const GamePhase = {
  WAITING: 'waiting',      // 等待玩家
  DEALING: 'dealing',      // 發牌階段
  FLOWER_REPLACEMENT: 'flower_replacement', // 開局補花
  PLAYING: 'playing',      // 遊戲進行中
  CLAIMING: 'claiming',    // 吃碰槓胡等待
  ENDED: 'ended'          // 遊戲結束
};

// 吃碰槓類型
const ClaimType = {
  CHI: 'chi',      // 吃
  PONG: 'pong',    // 碰
  KONG: 'kong',    // 槓
  HU: 'hu'         // 胡
};

module.exports = {
  allTiles,
  GamePhase,
  ClaimType
};

