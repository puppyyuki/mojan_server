/**
 * 俱樂部成員列表「自摸抽」顯示值。
 *
 * 規則：
 * 1. 一般玩家（非代理）自摸贏分 × 後台俱樂部 selfDrawRakePercent = 基準值 A（固定上繳池）。
 * 2. 代理自身打牌不再產生 A。
 * 3. 上層在「代理設置」為直屬下線設定的 agentPercentage，表示上層從該分支 A 中保留的比例（皆對原始 A 計算）。
 * 4. 同一分支由上往下各層保留比例加總 + 最底層代理拿走剩餘 = 100% × A。
 */

const { sumSelfDrawRakeMoneyByPlayerId } = require('./clubSelfDrawRakeMoney');

function roundMoney(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function clampPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * @param {Map<string, object>} bindingByPlayer
 * @param {Map<string, string>} upstreamBindingsByPlayer - PlayerClubUpstreamBinding
 */
function resolveFirstUpstream(playerId, bindingByPlayer, upstreamBindingsByPlayer) {
  const fromPlayerBinding = upstreamBindingsByPlayer.get(playerId);
  if (fromPlayerBinding) return fromPlayerBinding;

  const selfBinding = bindingByPlayer.get(playerId);
  return selfBinding?.upstreamAgentPlayerId ?? null;
}

/**
 * 自玩家向上收集代理鏈（不含玩家），順序為 [最靠近玩家的代理, …, 最上層代理]。
 */
function buildAgentPathFromPlayer(playerId, bindingByPlayer, upstreamBindingsByPlayer) {
  const path = [];
  const visited = new Set();
  let current = resolveFirstUpstream(playerId, bindingByPlayer, upstreamBindingsByPlayer);

  while (current && !visited.has(current)) {
    visited.add(current);
    if (bindingByPlayer.has(current)) {
      path.push(current);
    }
    const b = bindingByPlayer.get(current);
    current = b?.upstreamAgentPlayerId ?? null;
  }

  return path;
}

/**
 * @param {Map<string, number>} aByPlayer - playerId -> 基準值 A（已含後台自摸抽%）
 * @param {Array} bindings - AgentClubBinding rows
 * @param {Array<{ playerId: string, upstreamAgentPlayerId: string }>} [upstreamBindings]
 * @returns {Map<string, number>}
 */
function computeDisplaySelfDrawRakeByPlayer(aByPlayer, bindings, upstreamBindings = []) {
  const bindingByPlayer = new Map(bindings.map((b) => [b.playerId, b]));
  const upstreamBindingsByPlayer = new Map(
    upstreamBindings.map((u) => [u.playerId, u.upstreamAgentPlayerId])
  );

  const displayMap = new Map();
  for (const b of bindings) {
    displayMap.set(b.playerId, 0);
  }

  const isAgent = (pid) => bindingByPlayer.has(pid);

  for (const [playerId, aRaw] of aByPlayer.entries()) {
    const a = Number(aRaw) || 0;
    if (a <= 0) continue;
    if (isAgent(playerId)) continue;

    displayMap.set(playerId, roundMoney((displayMap.get(playerId) || 0) + a));

    const path = buildAgentPathFromPlayer(
      playerId,
      bindingByPlayer,
      upstreamBindingsByPlayer
    );
    if (path.length === 0) continue;

    let parentKeepSumRate = 0;
    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      const pct = clampPercent(binding?.agentPercentage);
      const rate = pct / 100;
      parentKeepSumRate += rate;

      const parentId = binding?.upstreamAgentPlayerId;
      if (parentId) {
        const add = roundMoney(a * rate);
        displayMap.set(parentId, roundMoney((displayMap.get(parentId) || 0) + add));
      }
    }

    const leafAgentId = path[0];
    const leafRate = Math.max(0, 1 - parentKeepSumRate);
    const leafAdd = roundMoney(a * leafRate);
    displayMap.set(
      leafAgentId,
      roundMoney((displayMap.get(leafAgentId) || 0) + leafAdd)
    );
  }

  for (const [pid, aRaw] of aByPlayer.entries()) {
    if (!displayMap.has(pid)) {
      const a = Number(aRaw) || 0;
      if (a > 0 && !isAgent(pid)) {
        displayMap.set(pid, roundMoney(a));
      } else {
        displayMap.set(pid, 0);
      }
    }
  }

  return displayMap;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, selfDrawRakePercent?: number|null }} club
 * @param {{ startAt: Date|null, endAt: Date|null }} range
 * @param {Array} bindings
 * @param {Array} [upstreamBindings]
 */
async function buildSelfDrawDisplayMap(
  prisma,
  club,
  range,
  bindings,
  upstreamBindings = []
) {
  const rakeByPlayer = await sumSelfDrawRakeMoneyByPlayerId(prisma, club, range);

  const aByPlayer = new Map();
  for (const [pid, rake] of rakeByPlayer.entries()) {
    aByPlayer.set(pid, rake);
  }

  return computeDisplaySelfDrawRakeByPlayer(aByPlayer, bindings, upstreamBindings);
}

module.exports = {
  roundMoney,
  clampPercent,
  buildAgentPathFromPlayer,
  computeDisplaySelfDrawRakeByPlayer,
  buildSelfDrawDisplayMap,
};
