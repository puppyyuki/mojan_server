/**
 * 俱樂部代理樹自摸抽顯示值（可變每層上繳 %）。
 * 參考 pos_system groupListAgentCalculations，改為每層 agentPercentage 可獨立設定。
 */

const { sumSelfDrawRakeMoneyByPlayerId } = require('./clubSelfDrawRakeMoney');

function roundMoney(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * 取得玩家上繳給上層的比例（0–100）。
 * - 無 binding：底層玩家，用 club.selfDrawRakePercent
 * - 有 binding：用上層「代理設置」寫入該玩家 binding 的 agentPercentage
 */
function resolveSubmitPercent(playerId, bindingByPlayer, clubSelfDrawPercent) {
  const binding = bindingByPlayer.get(playerId);
  if (!binding) {
    return Number(clubSelfDrawPercent) || 0;
  }
  if (!binding.upstreamAgentPlayerId) {
    return 0;
  }
  const pct = Number(binding.agentPercentage);
  if (Number.isFinite(pct) && pct >= 0) {
    return pct;
  }
  return Number(clubSelfDrawPercent) || 0;
}

/**
 * 後序 DP：計算每個節點的顯示自摸抽（個人留存 + 下線代理抽成）。
 *
 * @param {Map<string, number>} rawWinByPlayer - playerId -> 區間自摸正分總額（未扣層級）
 * @param {Array} bindings - AgentClubBinding rows
 * @param {number} clubSelfDrawPercent
 * @returns {Map<string, number>} playerId -> displaySelfDrawRake
 */
function computeDisplaySelfDrawRakeByPlayer(rawWinByPlayer, bindings, clubSelfDrawPercent) {
  const bindingByPlayer = new Map();
  const childrenMap = new Map();

  for (const b of bindings) {
    bindingByPlayer.set(b.playerId, b);
    const up = b.upstreamAgentPlayerId;
    if (up) {
      if (!childrenMap.has(up)) childrenMap.set(up, []);
      childrenMap.get(up).push(b.playerId);
    }
  }

  const allPlayerIds = new Set([...rawWinByPlayer.keys()]);
  for (const b of bindings) allPlayerIds.add(b.playerId);

  const displayMap = new Map();
  const superiorFlowMap = new Map();

  function dp(playerId) {
    if (superiorFlowMap.has(playerId)) {
      return superiorFlowMap.get(playerId);
    }

    const rawWin = rawWinByPlayer.get(playerId) || 0;
    const submitPct = resolveSubmitPercent(playerId, bindingByPlayer, clubSelfDrawPercent);
    const submitRate = Math.min(100, Math.max(0, submitPct)) / 100;
    const ownSubmit = rawWin * submitRate;
    const personalKeep = rawWin - ownSubmit;

    const children = childrenMap.get(playerId) || [];
    let childSuperiorSum = 0;
    for (const childId of children) {
      childSuperiorSum += dp(childId);
    }

    const keepShare = 1 - submitRate;
    const downlineCommission = childSuperiorSum * keepShare;
    const displayValue = roundMoney(personalKeep + downlineCommission);

    const flowToUpstream = ownSubmit + childSuperiorSum * submitRate;
    superiorFlowMap.set(playerId, flowToUpstream);
    displayMap.set(playerId, displayValue);
    return flowToUpstream;
  }

  for (const pid of allPlayerIds) {
    if (!superiorFlowMap.has(pid)) {
      dp(pid);
    }
  }

  for (const pid of allPlayerIds) {
    if (!displayMap.has(pid)) {
      const rawWin = rawWinByPlayer.get(pid) || 0;
      const submitPct = resolveSubmitPercent(pid, bindingByPlayer, clubSelfDrawPercent);
      const submitRate = Math.min(100, Math.max(0, submitPct)) / 100;
      displayMap.set(pid, roundMoney(rawWin * (1 - submitRate)));
    }
  }

  return displayMap;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, selfDrawRakePercent?: number|null }} club
 * @param {{ startAt: Date|null, endAt: Date|null }} range
 * @param {Array} bindings
 */
async function buildSelfDrawDisplayMap(prisma, club, range, bindings) {
  const rakeRate = (Number(club.selfDrawRakePercent) || 8) / 100;
  const rakeByPlayer = await sumSelfDrawRakeMoneyByPlayerId(prisma, club, range);

  const rawWinByPlayer = new Map();
  for (const [pid, rake] of rakeByPlayer.entries()) {
    if (rakeRate > 0) {
      rawWinByPlayer.set(pid, rake / rakeRate);
    } else {
      rawWinByPlayer.set(pid, 0);
    }
  }

  return computeDisplaySelfDrawRakeByPlayer(
    rawWinByPlayer,
    bindings,
    club.selfDrawRakePercent ?? 8
  );
}

module.exports = {
  roundMoney,
  resolveSubmitPercent,
  computeDisplaySelfDrawRakeByPlayer,
  buildSelfDrawDisplayMap,
};
