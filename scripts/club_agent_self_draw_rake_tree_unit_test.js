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
    agentPercentage: 1,
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
  assert.strictEqual(result.get('mid'), 3);
  assert.strictEqual(result.get('master'), 1);
  assert.strictEqual(result.get('super'), 1);
}

function testAgentSelfDrawIncludesOwnUpstreamSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([['mid', 1000]]),
    new Map([['mid', 50]]),
    bindings,
    [],
    5
  );

  assert.strictEqual(result.get('mid'), 20);
  assert.strictEqual(result.get('master'), 10);
  assert.strictEqual(result.get('super'), 10);
}

function testAgentDisplayAddsDownstreamIncomeAndOwnSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([
      ['player', 100],
      ['mid', 1000],
    ]),
    new Map([
      ['player', 5],
      ['mid', 50],
    ]),
    bindings,
    [{ playerId: 'player', upstreamAgentPlayerId: 'mid' }],
    5
  );

  assert.strictEqual(result.get('player'), 5);
  assert.strictEqual(result.get('mid'), 23);
  assert.strictEqual(result.get('master'), 11);
  assert.strictEqual(result.get('super'), 11);
}

testAgentPercentageInputConvertsByClubRakePercent();
testNormalPlayerDistributionUnchanged();
testAgentSelfDrawIncludesOwnUpstreamSubmit();
testAgentDisplayAddsDownstreamIncomeAndOwnSubmit();

console.log('club_agent_self_draw_rake_tree_unit_test passed');
