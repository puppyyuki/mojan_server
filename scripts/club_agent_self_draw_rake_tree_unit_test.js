/**
 * 俱樂部代理自摸抽顯示值純函式單元測試（無 DB）。
 * 執行：node scripts/club_agent_self_draw_rake_tree_unit_test.js
 */

const assert = require('assert');
const {
  agentPercentageRate,
  computeDisplaySelfDrawRakeByPlayer,
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
  assert.strictEqual(agentPercentageRate(1, 5), 0.2);
  assert.strictEqual(agentPercentageRate(2.5, 5), 0.5);
  assert.strictEqual(agentPercentageRate(1, 0), 0);
}

function testNormalPlayerDistributionUnchanged() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([['player', 100]]),
    new Map([['player', 5]]),
    bindings,
    [{ playerId: 'player', upstreamAgentPlayerId: 'mid' }],
    5
  );

  assert.strictEqual(result.get('player'), 5);
  assert.strictEqual(result.get('mid'), 2);
  assert.strictEqual(result.get('master'), 1);
  assert.strictEqual(result.get('super'), 2);
}

function testAgentSelfDrawIncludesOwnUpstreamSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([['mid', 100]]),
    new Map([['mid', 5]]),
    bindings,
    [],
    5
  );

  assert.strictEqual(result.get('mid'), 60);
  assert.strictEqual(result.get('master'), 20);
  assert.strictEqual(result.get('super'), 40);
}

function testAgentDisplayAddsDownstreamIncomeAndOwnSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([
      ['player', 100],
      ['mid', 100],
    ]),
    new Map([
      ['player', 5],
      ['mid', 5],
    ]),
    bindings,
    [{ playerId: 'player', upstreamAgentPlayerId: 'mid' }],
    5
  );

  assert.strictEqual(result.get('player'), 5);
  assert.strictEqual(result.get('mid'), 62);
  assert.strictEqual(result.get('master'), 21);
  assert.strictEqual(result.get('super'), 42);
}

testAgentPercentageInputConvertsByClubRakePercent();
testNormalPlayerDistributionUnchanged();
testAgentSelfDrawIncludesOwnUpstreamSubmit();
testAgentDisplayAddsDownstreamIncomeAndOwnSubmit();

console.log('club_agent_self_draw_rake_tree_unit_test passed');
