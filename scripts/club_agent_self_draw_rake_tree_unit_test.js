/**
 * 俱樂部代理自摸抽顯示值純函式單元測試（無 DB）。
 * 執行：node scripts/club_agent_self_draw_rake_tree_unit_test.js
 */

const assert = require('assert');
const {
  agentPercentageRate,
  computeViewerSelfDrawRakeForRow,
} = require('../utils/clubAgentSelfDrawRakeTree');

const bindings = [
  {
    playerId: 'super',
    upstreamAgentPlayerId: null,
    agentPercentage: 0,
  },
  {
    playerId: 'master',
    upstreamAgentPlayerId: 'super',
    agentPercentage: 2,
  },
  {
    playerId: 'mid',
    upstreamAgentPlayerId: 'master',
    agentPercentage: 1,
  },
];

function testAgentPercentageInputConvertsByClubRakePercent() {
  assert.strictEqual(agentPercentageRate(2, 5), 0.4);
  assert.strictEqual(agentPercentageRate(1, 5), 0.2);
  assert.strictEqual(agentPercentageRate(1, 0), 0);
}

function testUserExampleMasterSeesPlayerPoolSuperSeesMaster40() {
  const winByPlayer = new Map([
    ['player', 1000],
    ['master', 1000],
  ]);
  const poolByPlayer = new Map([
    ['player', 50],
    ['master', 50],
  ]);
  const upstreamBindings = [{ playerId: 'player', upstreamAgentPlayerId: 'master' }];

  const masterSeesPlayer = computeViewerSelfDrawRakeForRow(
    'master',
    'player',
    winByPlayer,
    poolByPlayer,
    bindings,
    upstreamBindings,
    5
  );
  const superSeesMaster = computeViewerSelfDrawRakeForRow(
    'super',
    'master',
    winByPlayer,
    poolByPlayer,
    bindings,
    upstreamBindings,
    5
  );

  assert.strictEqual(masterSeesPlayer, 50);
  assert.strictEqual(superSeesMaster, 40);
}

function testZeroPercentMasterPlayer2000SuperSeesMaster0() {
  const zeroBindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 0 },
  ];
  const winByPlayer = new Map([['player', 2000]]);
  const poolByPlayer = new Map([['player', 100]]);
  const upstreamBindings = [{ playerId: 'player', upstreamAgentPlayerId: 'master' }];

  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'master',
      'player',
      winByPlayer,
      poolByPlayer,
      zeroBindings,
      upstreamBindings,
      5
    ),
    100
  );
  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'super',
      'master',
      winByPlayer,
      poolByPlayer,
      zeroBindings,
      upstreamBindings,
      5
    ),
    0
  );
}

function testZeroPercentMasterSelfDrawSuperSeesMaster0() {
  const zeroBindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 0 },
  ];
  const winByPlayer = new Map([['master', 1000]]);
  const poolByPlayer = new Map([['master', 50]]);

  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'super',
      'master',
      winByPlayer,
      poolByPlayer,
      zeroBindings,
      [],
      5
    ),
    0
  );
}

function testThreeTierPlayerDistribution() {
  const winByPlayer = new Map([['player', 100]]);
  const poolByPlayer = new Map([['player', 5]]);
  const upstreamBindings = [{ playerId: 'player', upstreamAgentPlayerId: 'mid' }];
  const tierBindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 1 },
    { playerId: 'mid', upstreamAgentPlayerId: 'master', agentPercentage: 1 },
  ];

  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'mid',
      'player',
      winByPlayer,
      poolByPlayer,
      tierBindings,
      upstreamBindings,
      5
    ),
    5
  );
  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'master',
      'player',
      winByPlayer,
      poolByPlayer,
      tierBindings,
      upstreamBindings,
      5
    ),
    1
  );
  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'super',
      'player',
      winByPlayer,
      poolByPlayer,
      tierBindings,
      upstreamBindings,
      5
    ),
    1
  );
}

function testSelfRowIncludesOwnSelfDrawKeep() {
  const winByPlayer = new Map([['master', 1000]]);
  const poolByPlayer = new Map([['master', 50]]);
  const upstreamBindings = [];

  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'master',
      'master',
      winByPlayer,
      poolByPlayer,
      bindings,
      upstreamBindings,
      5
    ),
    30
  );
}

function testDirectDownlineRowIncludesAgentSelfDrawAndSubtree() {
  const winByPlayer = new Map([
    ['player', 100],
    ['mid', 1000],
  ]);
  const poolByPlayer = new Map([
    ['player', 5],
    ['mid', 50],
  ]);
  const upstreamBindings = [{ playerId: 'player', upstreamAgentPlayerId: 'mid' }];
  const tierBindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 1 },
    { playerId: 'mid', upstreamAgentPlayerId: 'master', agentPercentage: 1 },
  ];

  assert.strictEqual(
    computeViewerSelfDrawRakeForRow(
      'master',
      'mid',
      winByPlayer,
      poolByPlayer,
      tierBindings,
      upstreamBindings,
      5
    ),
    11
  );
}

testAgentPercentageInputConvertsByClubRakePercent();
testUserExampleMasterSeesPlayerPoolSuperSeesMaster40();
testZeroPercentMasterPlayer2000SuperSeesMaster0();
testZeroPercentMasterSelfDrawSuperSeesMaster0();
testThreeTierPlayerDistribution();
testSelfRowIncludesOwnSelfDrawKeep();
testDirectDownlineRowIncludesAgentSelfDrawAndSubtree();

console.log('club_agent_self_draw_rake_tree_unit_test passed');
