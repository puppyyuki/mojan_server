const assert = require('assert');

const { calculateTai } = require('../server');

function run() {
  const basePlayer = {
    id: 'p1',
    name: 'P1',
    isDealer: false,
    isDuTing: false,
    isQiangGang: false,
    isGangShangKaiHua: false,
    isHaiDiLaoYue: false,
    isHaiDiLaoYu: false,
    isHuaGang: false,
    isQuanQiu: false,
    isSanAnKe: false,
    isPengPengHu: false,
    isHunYiSe: false,
    isXiaoSanYuan: false,
    isSiAnKe: false,
    isDiTing: false,
    isWuAnKe: false,
    isQingYiSe: false,
    isZiYiSe: false,
    isDaSanYuan: false,
    isXiaoSiXi: false,
    isLiGuLiGu: false,
    isBaXianGuoHai: false,
    isTianTing: false,
    isDaSiXi: false
  };

  const table = {
    windStart: 0,
    round: 1,
    wind: 0,
    gameSettings: { point_cap: 'NO_LIMIT' },
    hiddenHands: {
      p1: ['發', '發', '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬', '一筒', '二筒', '三筒', '四筒', '五筒']
    },
    melds: { p1: [] },
    flowers: { p1: [] }
  };

  const result = calculateTai(table, basePlayer, 0, 'hu', '發');
  assert.ok(result.patternNames.includes('三元台(1)'), '應該計入三元台(1)');
}

try {
  run();
  console.log('OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}

