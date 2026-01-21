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
    turnHasDiscarded: false,
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
        if (table.turnHasDiscarded) return;
        table.turnHasDiscarded = true;
        const hand = table.hiddenHands[playerId];
        const idx = hand.indexOf(tile);
        if (idx >= 0) hand.splice(idx, 1);
        table.discards[playerId].push(tile);
        table.turn = (table.turn + 1) % 4;
        table.turnHasDiscarded = false;
      },
      handleClaimRequest: () => {},
      passClaim: () => {},
    },
  };

  const engine = new TableEngine('t1', { deps });

  const r1 = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '九萬', clientSeq: 1 });
  assert.equal(r1[0].type, 'REJECTED');
  assert.equal(r1[0].code, 'TILE_NOT_IN_HAND');
  assert.equal(r1[1].type, 'TABLE_SNAPSHOT');

  const r2 = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '一萬', clientSeq: 2 });
  assert.equal(r2[0].type, 'DISCARDED');
  assert.equal(r2[1].type, 'HAND_SYNC');
  assert.equal(r2[1].myHand.includes('一萬'), false);
  assert.equal(r2[2].type, 'TABLE_SNAPSHOT');
  assert.equal(r2[2].myPrivate.myHand.includes('一萬'), false);
  assert.equal(r2[2].publicState.wallRemaining, 80);
  assert.ok(Array.isArray(r2[2].players));
  assert.equal(r2[2].publicState.handCounts.p1, 1);

  const r2Replay = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '一萬', clientSeq: 2 });
  assert.deepEqual(r2Replay, r2);

  table.turn = 0;
  table.turnHasDiscarded = true;
  const r3 = engine.applyIntent('p1', { type: 'DISCARD_INTENT', tile: '二萬', clientSeq: 3 });
  assert.equal(r3[0].type, 'REJECTED');
  assert.equal(r3[0].code, 'ALREADY_DISCARDED');
  assert.equal(r3[1].type, 'TABLE_SNAPSHOT');

  const r4 = engine.applyIntent('p1', { type: 'CLAIM_INTENT', claim: 'PASS', tiles: [], clientSeq: 4 });
  assert.equal(r4[0].type, 'REJECTED');
  assert.equal(r4[0].code, 'NOT_CLAIMING');
  assert.equal(r4[1].type, 'TABLE_SNAPSHOT');

  table.gamePhase = 'claiming';
  table.claimingState = { resolved: true, processing: false };
  const r5 = engine.applyIntent('p1', { type: 'CLAIM_INTENT', claim: 'PASS', tiles: [], clientSeq: 5 });
  assert.equal(r5[0].type, 'REJECTED');
  assert.equal(r5[0].code, 'CLAIM_ALREADY_RESOLVED');
  assert.equal(r5[1].type, 'TABLE_SNAPSHOT');

  const snap = engine.snapshotFor('p1');
  assert.equal(snap.type, 'TABLE_SNAPSHOT');
  assert.ok(typeof snap.serverSeq === 'number');
  assert.equal(snap.publicState.handCounts.p1, 1);
}

run();

