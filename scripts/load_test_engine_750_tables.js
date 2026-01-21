const { performance } = require('perf_hooks');
const { TableEngine } = require('../packages/engine');

function intArg(name, fallback) {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const v = parseInt(raw.split('=')[1], 10);
  return Number.isFinite(v) ? v : fallback;
}

function makeTiles(count, seed) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(`T${seed}-${i}`);
  return out;
}

function makeTable(tableId) {
  const players = [
    { id: `${tableId}:p1`, seat: 0, isDealer: true },
    { id: `${tableId}:p2`, seat: 1 },
    { id: `${tableId}:p3`, seat: 2 },
    { id: `${tableId}:p4`, seat: 3 },
  ];
  const hiddenHands = {};
  const discards = {};
  const melds = {};
  const flowers = {};
  for (const p of players) {
    hiddenHands[p.id] = makeTiles(16, p.id);
    discards[p.id] = [];
    melds[p.id] = [];
    flowers[p.id] = [];
  }
  return {
    id: tableId,
    players,
    hiddenHands,
    melds,
    discards,
    flowers,
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function run() {
  const tableCount = intArg('tables', 750);
  const durationSec = intArg('durationSec', 30);
  const minEventsPerSecPerTable = intArg('minEps', 1);
  const maxEventsPerSecPerTable = intArg('maxEps', 3);
  const duplicateRate = intArg('duplicatePct', 5);

  const tables = new Array(tableCount);
  const engines = new Array(tableCount);
  const clientSeqByPlayerId = new Map();

  for (let i = 0; i < tableCount; i++) {
    const tableId = `t${i + 1}`;
    const table = makeTable(tableId);
    const deps = {
      getTable: () => table,
      legacyActions: {
        discardTile: (_tid, playerId, tile) => {
          if (table.turnHasDiscarded) return;
          table.turnHasDiscarded = true;
          const hand = table.hiddenHands[playerId];
          const idx = hand.indexOf(tile);
          if (idx >= 0) hand.splice(idx, 1);
          table.discards[playerId].push(tile);
          const nextSeat = (table.turn + 1) % 4;
          table.turn = nextSeat;
          const nextPid = table.players[nextSeat].id;
          table.hiddenHands[nextPid].push(`D${Date.now()}-${Math.random()}`);
          table.turnHasDiscarded = false;
        },
        handleClaimRequest: () => {},
        passClaim: () => {},
      },
    };
    tables[i] = table;
    engines[i] = new TableEngine(tableId, { deps });
    for (const p of table.players) clientSeqByPlayerId.set(p.id, 0);
  }

  const startedAt = performance.now();
  let totalIntents = 0;
  let totalEvents = 0;
  let totalApplyMs = 0;

  let lastReportAt = startedAt;
  let lastReportIntents = 0;
  let expectedTickAt = performance.now();
  let maxLagMs = 0;

  function tickOnce() {
    const now = performance.now();
    expectedTickAt += 1000;
    const lag = Math.max(0, now - expectedTickAt);
    maxLagMs = Math.max(maxLagMs, lag);

    for (let i = 0; i < tableCount; i++) {
      const table = tables[i];
      const engine = engines[i];
      const k = minEventsPerSecPerTable + Math.floor(Math.random() * (maxEventsPerSecPerTable - minEventsPerSecPerTable + 1));
      for (let j = 0; j < k; j++) {
        const seat = table.turn;
        const pid = table.players[seat].id;
        const hand = table.hiddenHands[pid];
        if (!Array.isArray(hand) || hand.length === 0) continue;

        let nextClientSeq = clientSeqByPlayerId.get(pid) || 0;
        const isDuplicate = Math.random() * 100 < duplicateRate;
        if (!isDuplicate) {
          nextClientSeq += 1;
          clientSeqByPlayerId.set(pid, nextClientSeq);
        }

        const tile = pickRandom(hand);
        const t0 = performance.now();
        const events = engine.applyIntent(pid, { type: 'DISCARD_INTENT', tile, clientSeq: nextClientSeq });
        totalApplyMs += performance.now() - t0;
        totalIntents += 1;
        totalEvents += Array.isArray(events) ? events.length : 0;
      }
    }

    if (now - lastReportAt >= 5000) {
      const intentsDelta = totalIntents - lastReportIntents;
      const seconds = (now - lastReportAt) / 1000;
      const eps = intentsDelta / seconds;
      const avgApplyMs = totalIntents > 0 ? totalApplyMs / totalIntents : 0;
      const avgEventsPerIntent = totalIntents > 0 ? totalEvents / totalIntents : 0;
      const heap = process.memoryUsage().heapUsed / (1024 * 1024);

      console.log(
        JSON.stringify({
          tables: tableCount,
          durationSec,
          duplicatePct: duplicateRate,
          intentsPerSec: Math.round(eps),
          avgApplyMs: Math.round(avgApplyMs * 1000) / 1000,
          avgEventsPerIntent: Math.round(avgEventsPerIntent * 1000) / 1000,
          heapMB: Math.round(heap * 10) / 10,
          maxLagMs: Math.round(maxLagMs),
        })
      );

      lastReportAt = now;
      lastReportIntents = totalIntents;
      maxLagMs = 0;
    }
  }

  const interval = setInterval(tickOnce, 1000);

  setTimeout(() => {
    clearInterval(interval);
    const endedAt = performance.now();
    const elapsedSec = (endedAt - startedAt) / 1000;
    console.log(
      JSON.stringify({
        done: true,
        elapsedSec: Math.round(elapsedSec * 1000) / 1000,
        totalIntents,
        totalEvents,
        avgApplyMs: totalIntents > 0 ? Math.round((totalApplyMs / totalIntents) * 1000) / 1000 : 0,
      })
    );
    process.exit(0);
  }, durationSec * 1000);
}

run();
