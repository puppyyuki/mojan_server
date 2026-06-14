/**
 * 俱樂部代理配額分支加總純函式測試（無 DB）。
 * 執行：node scripts/club_agent_quota_allocation_unit_test.js
 */

const assert = require('assert');
const {
  computeAvailableForTarget,
  validateAgentBranchQuota,
} = require('../utils/clubAgentQuotaAllocation');

function testUserExampleAllowsFiveAfterOne() {
  const bindings = [
    {
      playerId: 'super',
      upstreamAgentPlayerId: null,
      agentPercentage: 2,
      agentRoomCardFee: 2,
    },
    {
      playerId: 'master',
      upstreamAgentPlayerId: 'super',
      agentPercentage: 1,
      agentRoomCardFee: 1,
    },
    {
      playerId: 'mid',
      upstreamAgentPlayerId: 'master',
      agentPercentage: 0,
      agentRoomCardFee: 0,
    },
  ];

  assert.strictEqual(
    computeAvailableForTarget(bindings, 'mid', 6, 'agentPercentage'),
    5
  );
  assert.strictEqual(
    computeAvailableForTarget(bindings, 'mid', 6, 'agentRoomCardFee'),
    5
  );
  assert.strictEqual(
    validateAgentBranchQuota({
      bindings,
      targetPlayerId: 'mid',
      agentPercentage: 5,
      agentRoomCardFee: 5,
      totalPercentage: 6,
      totalRoomCards: 6,
    }).ok,
    true
  );
  assert.strictEqual(
    validateAgentBranchQuota({
      bindings,
      targetPlayerId: 'mid',
      agentPercentage: 5.1,
      agentRoomCardFee: 5,
      totalPercentage: 6,
      totalRoomCards: 6,
    }).message,
    '您目前可分配的%數為：5，可分配的房卡數為：5'
  );
}

function testSiblingBranchesAreIndependent() {
  const bindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0, agentRoomCardFee: 0 },
    { playerId: 'masterA', upstreamAgentPlayerId: 'super', agentPercentage: 6, agentRoomCardFee: 6 },
    { playerId: 'masterB', upstreamAgentPlayerId: 'super', agentPercentage: 0, agentRoomCardFee: 0 },
  ];

  const result = validateAgentBranchQuota({
    bindings,
    targetPlayerId: 'masterB',
    agentPercentage: 6,
    agentRoomCardFee: 6,
    totalPercentage: 6,
    totalRoomCards: 6,
  });
  assert.strictEqual(result.ok, true);
}

function testDescendantBranchLimitsParentIncrease() {
  const bindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0, agentRoomCardFee: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 1, agentRoomCardFee: 1 },
    { playerId: 'midA', upstreamAgentPlayerId: 'master', agentPercentage: 4, agentRoomCardFee: 2 },
    { playerId: 'midB', upstreamAgentPlayerId: 'master', agentPercentage: 2, agentRoomCardFee: 4 },
  ];

  const result = validateAgentBranchQuota({
    bindings,
    targetPlayerId: 'master',
    agentPercentage: 3,
    agentRoomCardFee: 3,
    totalPercentage: 6,
    totalRoomCards: 6,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.message, '您目前可分配的%數為：2，可分配的房卡數為：2');
}

function testRoomCardsCanFailIndependently() {
  const bindings = [
    { playerId: 'super', upstreamAgentPlayerId: null, agentPercentage: 0, agentRoomCardFee: 0 },
    { playerId: 'master', upstreamAgentPlayerId: 'super', agentPercentage: 0, agentRoomCardFee: 0 },
  ];

  const result = validateAgentBranchQuota({
    bindings,
    targetPlayerId: 'master',
    agentPercentage: 4,
    agentRoomCardFee: 7,
    totalPercentage: 6,
    totalRoomCards: 6,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.message, '您目前可分配的%數為：6，可分配的房卡數為：6');
}

testUserExampleAllowsFiveAfterOne();
testSiblingBranchesAreIndependent();
testDescendantBranchLimitsParentIncrease();
testRoomCardsCanFailIndependently();

console.log('club_agent_quota_allocation_unit_test passed');
