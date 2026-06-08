/**
 * 俱樂部代理自摸抽顯示值純函式單元測試（無 DB）。
 * 執行：node scripts/club_agent_self_draw_rake_tree_unit_test.js
 */

const assert = require('assert');
const {
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
    agentPercentage: 10,
  },
  {
    playerId: 'mid',
    upstreamAgentPlayerId: 'master',
    agentPercentage: 10,
  },
  {
    playerId: 'small',
    upstreamAgentPlayerId: 'mid',
    agentPercentage: 10,
  },
];

function testNormalPlayerDistributionUnchanged() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([['player', 1000]]),
    new Map([['player', 100]]),
    bindings,
    [{ playerId: 'player', upstreamAgentPlayerId: 'small' }],
    10
  );

  assert.strictEqual(result.get('player'), 100);
  assert.strictEqual(result.get('small'), 70);
  assert.strictEqual(result.get('mid'), 10);
  assert.strictEqual(result.get('master'), 10);
  assert.strictEqual(result.get('super'), 10);
}

function testAgentSelfDrawIncludesOwnUpstreamSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([['small', 1000]]),
    new Map([['small', 100]]),
    bindings,
    [],
    10
  );

  assert.strictEqual(result.get('small'), 30);
  assert.strictEqual(result.get('mid'), 10);
  assert.strictEqual(result.get('master'), 10);
  assert.strictEqual(result.get('super'), 10);
}

function testAgentDisplayAddsDownstreamIncomeAndOwnSubmit() {
  const result = computeDisplaySelfDrawRakeByPlayer(
    new Map([
      ['player', 1000],
      ['small', 1000],
    ]),
    new Map([
      ['player', 100],
      ['small', 100],
    ]),
    bindings,
    [{ playerId: 'player', upstreamAgentPlayerId: 'small' }],
    10
  );

  assert.strictEqual(result.get('player'), 100);
  assert.strictEqual(result.get('small'), 100);
  assert.strictEqual(result.get('mid'), 20);
  assert.strictEqual(result.get('master'), 20);
  assert.strictEqual(result.get('super'), 20);
}

testNormalPlayerDistributionUnchanged();
testAgentSelfDrawIncludesOwnUpstreamSubmit();
testAgentDisplayAddsDownstreamIncomeAndOwnSubmit();

console.log('club_agent_self_draw_rake_tree_unit_test passed');
