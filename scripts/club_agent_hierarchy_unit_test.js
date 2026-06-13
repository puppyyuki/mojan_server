/**
 * 俱樂部代理階層單元測試（無 DB）。
 * 執行：node scripts/club_agent_hierarchy_unit_test.js
 */

const assert = require('assert');
const {
  PROMOTABLE_LEVELS,
  getAssignableAgentLevels,
  isValidPromotableLevel,
  isValidAgentLevel,
  levelOrder,
} = require('../lib/agent-levels.shared.js');
const { agentLevelLabelZh } = require('../lib/agent-level-labels.shared.js');

function testPromotableLevelsIncludeNewTiers() {
  assert.strictEqual(PROMOTABLE_LEVELS.length, 7);
  assert(PROMOTABLE_LEVELS.includes('dealer'));
  assert(PROMOTABLE_LEVELS.includes('distributor'));
  assert(PROMOTABLE_LEVELS.includes('promoter'));
}

function testGetAssignableAgentLevelsWithoutUpstream() {
  const levels = getAssignableAgentLevels(null);
  assert.deepStrictEqual(levels, [...PROMOTABLE_LEVELS]);
}

function testGetAssignableAgentLevelsUnderAgent() {
  const levels = getAssignableAgentLevels('agent');
  assert.deepStrictEqual(levels, ['dealer', 'distributor', 'promoter']);
}

function testGetAssignableAgentLevelsUnderPromoterIsEmpty() {
  const levels = getAssignableAgentLevels('promoter');
  assert.deepStrictEqual(levels, []);
}

function testIsValidPromotableLevelDealer() {
  assert.strictEqual(isValidPromotableLevel('dealer'), true);
  assert.strictEqual(isValidPromotableLevel('super'), false);
}

function testIsValidAgentLevelNewSlugs() {
  assert.strictEqual(isValidAgentLevel('dealer'), true);
  assert.strictEqual(isValidAgentLevel('distributor'), true);
  assert.strictEqual(isValidAgentLevel('promoter'), true);
  assert.strictEqual(isValidAgentLevel('invalid'), false);
}

function testLevelOrderEightTierChain() {
  assert.ok(levelOrder('super') > levelOrder('master'));
  assert.ok(levelOrder('master') > levelOrder('agent'));
  assert.ok(levelOrder('agent') > levelOrder('dealer'));
  assert.ok(levelOrder('dealer') > levelOrder('distributor'));
  assert.ok(levelOrder('distributor') > levelOrder('promoter'));
}

function testAgentLevelLabelZhNewTiers() {
  assert.strictEqual(agentLevelLabelZh('dealer'), '經銷');
  assert.strictEqual(agentLevelLabelZh('distributor'), '分銷');
  assert.strictEqual(agentLevelLabelZh('promoter'), '推廣');
}

testPromotableLevelsIncludeNewTiers();
testGetAssignableAgentLevelsWithoutUpstream();
testGetAssignableAgentLevelsUnderAgent();
testGetAssignableAgentLevelsUnderPromoterIsEmpty();
testIsValidPromotableLevelDealer();
testIsValidAgentLevelNewSlugs();
testLevelOrderEightTierChain();
testAgentLevelLabelZhNewTiers();

console.log('club_agent_hierarchy_unit_test passed');
