/**
 * 俱樂部代理階層常數（SSOT）。
 * 階層：super > master > mid > small > agent > dealer > distributor > promoter
 */

/** @type {readonly string[]} */
const AGENT_LEVELS = Object.freeze([
  'super',
  'master',
  'mid',
  'small',
  'agent',
  'dealer',
  'distributor',
  'promoter',
]);

/** 會長可任命層級（不含 super） */
/** @type {readonly string[]} */
const PROMOTABLE_LEVELS = Object.freeze([
  'master',
  'mid',
  'small',
  'agent',
  'dealer',
  'distributor',
  'promoter',
]);

/** @type {readonly string[]} */
const LEGACY_AGENT_LEVELS = Object.freeze(['normal', 'master', 'vip']);

/** @type {readonly string[]} */
const ALL_KNOWN_AGENT_LEVELS = Object.freeze([
  ...AGENT_LEVELS,
  'normal',
  'vip',
]);

/** 數字越大越上層 */
const AGENT_LEVEL_ORDER = Object.freeze({
  promoter: 1,
  distributor: 2,
  dealer: 3,
  agent: 4,
  normal: 4,
  small: 5,
  mid: 6,
  master: 7,
  super: 8,
  vip: 8,
});

const AGENT_LEVEL_SET = new Set(AGENT_LEVELS);

function isValidAgentLevel(level) {
  return AGENT_LEVEL_SET.has(String(level ?? '').trim().toLowerCase());
}

function normalizeAgentLevel(level) {
  const raw = String(level ?? '').trim().toLowerCase();
  return isValidAgentLevel(raw) ? raw : 'agent';
}

function isSuperAgentLevel(level) {
  return String(level ?? '').trim().toLowerCase() === 'super';
}

function levelOrder(level) {
  const raw = String(level ?? '').trim().toLowerCase();
  return AGENT_LEVEL_ORDER[raw] ?? 0;
}

function isValidPromotableLevel(level) {
  return PROMOTABLE_LEVELS.includes(String(level ?? '').trim().toLowerCase());
}

/**
 * 依上層代理層級回傳可授予的代理層級（不含 super）。
 * @param {string|null|undefined} upstreamLevel
 * @returns {string[]}
 */
function getAssignableAgentLevels(upstreamLevel) {
  const up =
    upstreamLevel == null || upstreamLevel === ''
      ? null
      : String(upstreamLevel).trim().toLowerCase();
  if (!up) {
    return [...PROMOTABLE_LEVELS];
  }
  const upOrder = levelOrder(up);
  if (upOrder <= 0) {
    return [...PROMOTABLE_LEVELS];
  }
  return PROMOTABLE_LEVELS.filter((lvl) => levelOrder(lvl) < upOrder);
}

module.exports = {
  AGENT_LEVELS,
  PROMOTABLE_LEVELS,
  LEGACY_AGENT_LEVELS,
  ALL_KNOWN_AGENT_LEVELS,
  AGENT_LEVEL_ORDER,
  isValidAgentLevel,
  normalizeAgentLevel,
  isSuperAgentLevel,
  levelOrder,
  isValidPromotableLevel,
  getAssignableAgentLevels,
};
