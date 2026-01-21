const assert = require('assert');
const { TableEngine } = require('../packages/engine');

function makeTable() {
  return {
    id: 't1',
    players: [
      { id: 'p1', seat: 0, isDealer: true },
      { id: 'p2', seat: 1 },
      { id: 'p3', seat: 2 },
      { id: 'p4', seat: 3 },
    ],
    hiddenHands: {
      p1: ['一萬', '二萬'],
      p2: [],
      p3: [],
      p4: [],
    },
    melds: { p1: [], p2: [], p3: [], p4: [] },
    discards: { p1: [], p2: [], p3: [], p4: [] },
    flowers: { p1: [], p2: [], p3: [], p4: [] },
    deck: new Array(80).fill('x'),
    turn: 0,
    dealerIndex: 0,
    windStart: 0,
    round: 1,
    gamePhase: 'playing',
    gameSettings: { point_cap: 'UP_TO_8_POINTS' },
  };
}

function run() {
  let table = makeTable();

  const deps = {
    getTable: () => table,
    legacyActions: {
      discardTile: (_tableId, playerId, tile) => {
        const hand = table.hiddenHands[playerId];
        const idx = hand.indexOf(tile);
        if (idx >= 0) hand.splice(idx, 1);
        table.discards[playerId].push(tile);
        table.turn = (table.turn + 1) % 4;
      },
      executeClaim: () => {},
      passClaim: () => {},
    },
  };

  const engine = new TableEngine('t1', { deps });

  const r1 = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '九萬', clientSeq: 1 });
  assert.equal(r1[0].type, 'REJECTED');
  assert.equal(r1[0].code, 'TILE_NOT_IN_HAND');

  const r2 = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '一萬', clientSeq: 2 });
  assert.equal(r2[0].type, 'DISCARDED');
  assert.equal(r2[1].type, 'TURN_START');
  assert.equal(r2[2].type, 'HAND_SYNC');
  assert.equal(r2[2].myHand.includes('一萬'), false);
  assert.equal(r2[3].type, 'TABLE_SNAPSHOT');
  assert.equal(r2[3].myPrivate.myHand.includes('一萬'), false);
  assert.equal(r2[3].publicState.wallRemaining, 80);
  assert.ok(Array.isArray(r2[3].players));
  assert.equal(r2[3].publicState.handCounts.p1, 1);

  const snap = engine.snapshotFor('p1');
  assert.equal(snap.type, 'TABLE_SNAPSHOT');
  assert.ok(typeof snap.serverSeq === 'number');
  assert.equal(snap.publicState.handCounts.p1, 1);
}

run();

