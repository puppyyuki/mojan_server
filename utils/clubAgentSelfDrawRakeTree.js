/**
 * 俱樂部成員列表「自摸抽」顯示值（觀看者視角）。
 *
 * - 俱樂部 selfDrawRakePercent（後台「俱樂部管理 > 編輯」）決定上繳池 A = 自摸贏分 × %
 * - 代理 agentPercentage 為原始贏分百分點，換算成池內比例後往上分配
 * - 每一列顯示：觀看者（actor）從該成員及其下線自摸活動中「實際收到」的金額
 *   - 玩家列：觀看者為其直屬上線代理時，顯示該代理從此玩家分到的部分
 *   - 代理列：觀看者為其上線時，顯示下線上繳給觀看者的部分（含下線玩家與下線代理自身自摸）
 */

const { aggregateSelfDrawStatsByPlayerId } = require('./clubSelfDrawRakeMoney');

function roundMoney(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function clampPercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function agentPercentageRate(agentPercentage, clubRakePercent) {
  const rakePercent = clampPercent(clubRakePercent);
  if (rakePercent <= 0) return 0;

  const effectivePercentOfPool =
    (clampPercent(agentPercentage) * 100) / rakePercent;
  return clampPercent(effectivePercentOfPool) / 100;
}

function resolveFirstUpstream(playerId, bindingByPlayer, upstreamBindingsByPlayer) {
  const fromPlayerBinding = upstreamBindingsByPlayer.get(playerId);
  if (fromPlayerBinding) return fromPlayerBinding;

  const selfBinding = bindingByPlayer.get(playerId);
  return selfBinding?.upstreamAgentPlayerId ?? null;
}

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

function buildAgentPathFromSelf(agentId, bindingByPlayer) {
  const path = [];
  const visited = new Set();
  let current = agentId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const b = bindingByPlayer.get(current);
    if (!b) break;
    path.push(current);
    current = b.upstreamAgentPlayerId ?? null;
  }

  return path;
}

function createBindingContext(bindings, upstreamBindings = []) {
  const bindingByPlayer = new Map(bindings.map((b) => [b.playerId, b]));
  const upstreamBindingsByPlayer = new Map(
    upstreamBindings.map((u) => [u.playerId, u.upstreamAgentPlayerId])
  );
  const isAgent = (pid) => bindingByPlayer.has(pid);
  return { bindingByPlayer, upstreamBindingsByPlayer, isAgent };
}

function resolvePoolAmount(win, pool, rakeRate) {
  const winN = Number(win) || 0;
  const poolN = Number(pool) || 0;
  if (winN <= 0 && poolN <= 0) return 0;
  return poolN > 0 ? roundMoney(poolN) : roundMoney(winN * rakeRate);
}

/**
 * 自摸贏分來源是否歸屬於 target 列（本人或 target 下線）。
 */
function isWinAttributedToTarget(
  sourceId,
  targetId,
  bindingByPlayer,
  upstreamBindingsByPlayer
) {
  if (sourceId === targetId) return true;

  const visited = new Set();
  let current = sourceId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const upstream = resolveFirstUpstream(
      current,
      bindingByPlayer,
      upstreamBindingsByPlayer
    );
    if (upstream === targetId) return true;
    if (!upstream) break;
    current = upstream;
  }
  return false;
}

/**
 * 單一自摸來源的池 A，有多少流向觀看者 viewerId。
 */
function flowFromSourceToViewer(
  sourceId,
  viewerId,
  poolAmount,
  clubRakePercent,
  bindingByPlayer,
  upstreamBindingsByPlayer,
  isAgent
) {
  if (!viewerId || poolAmount <= 0) return 0;
  const a = poolAmount;

  if (isAgent(sourceId)) {
    const path = buildAgentPathFromSelf(sourceId, bindingByPlayer);
    let flow = 0;
    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      const parentId = binding?.upstreamAgentPlayerId;
      if (parentId !== viewerId) continue;

      flow = roundMoney(
        flow +
          a * agentPercentageRate(binding?.agentPercentage, clubRakePercent)
      );
    }
    return flow;
  }

  const path = buildAgentPathFromPlayer(
    sourceId,
    bindingByPlayer,
    upstreamBindingsByPlayer
  );
  if (path.length === 0) return 0;

  const leafAgentId = path[0];
  if (viewerId === leafAgentId) {
    let parentKeepSumRate = 0;
    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      parentKeepSumRate += agentPercentageRate(
        binding?.agentPercentage,
        clubRakePercent
      );
    }
    const leafRate = Math.max(0, 1 - parentKeepSumRate);
    return roundMoney(a * leafRate);
  }

  for (const agentId of path) {
    const binding = bindingByPlayer.get(agentId);
    const parentId = binding?.upstreamAgentPlayerId;
    if (parentId !== viewerId) continue;
    return roundMoney(
      a * agentPercentageRate(binding?.agentPercentage, clubRakePercent)
    );
  }

  return 0;
}

/**
 * 觀看者視角：target 列應顯示的自摸抽金額。
 */
function computeViewerSelfDrawRakeForRow(
  actorPlayerId,
  targetPlayerId,
  winByPlayer,
  poolByPlayer,
  bindings,
  upstreamBindings = [],
  clubRakePercent = 8
) {
  const { bindingByPlayer, upstreamBindingsByPlayer, isAgent } =
    createBindingContext(bindings, upstreamBindings);
  const rakeRate = clampPercent(clubRakePercent) / 100;

  const allSourceIds = new Set([
    ...winByPlayer.keys(),
    ...poolByPlayer.keys(),
  ]);

  let total = 0;
  for (const sourceId of allSourceIds) {
    if (
      !isWinAttributedToTarget(
        sourceId,
        targetPlayerId,
        bindingByPlayer,
        upstreamBindingsByPlayer
      )
    ) {
      continue;
    }

    const a = resolvePoolAmount(
      winByPlayer.get(sourceId),
      poolByPlayer.get(sourceId),
      rakeRate
    );
    if (a <= 0) continue;

    total = roundMoney(
      total +
        flowFromSourceToViewer(
          sourceId,
          actorPlayerId,
          a,
          clubRakePercent,
          bindingByPlayer,
          upstreamBindingsByPlayer,
          isAgent
        )
    );
  }

  return total;
}

/**
 * 批次計算多個成員列（觀看者視角）。
 * @param {string[]} targetPlayerIds
 * @returns {Map<string, number>}
 */
function computeViewerSelfDrawRakeByMember(
  actorPlayerId,
  targetPlayerIds,
  winByPlayer,
  poolByPlayer,
  bindings,
  upstreamBindings = [],
  clubRakePercent = 8
) {
  const displayMap = new Map();
  for (const targetId of targetPlayerIds) {
    displayMap.set(
      targetId,
      computeViewerSelfDrawRakeForRow(
        actorPlayerId,
        targetId,
        winByPlayer,
        poolByPlayer,
        bindings,
        upstreamBindings,
        clubRakePercent
      )
    );
  }
  return displayMap;
}

async function buildSelfDrawDisplayMap(
  prisma,
  club,
  range,
  bindings,
  upstreamBindings = [],
  actorPlayerId
) {
  const { winByPlayer, poolByPlayer, rakePercent } =
    await aggregateSelfDrawStatsByPlayerId(prisma, club, range);

  if (!actorPlayerId) {
    return new Map();
  }

  const targetIds = new Set([
    ...bindings.map((b) => b.playerId),
    ...upstreamBindings.map((u) => u.playerId),
    ...winByPlayer.keys(),
    ...poolByPlayer.keys(),
  ]);

  return computeViewerSelfDrawRakeByMember(
    actorPlayerId,
    [...targetIds],
    winByPlayer,
    poolByPlayer,
    bindings,
    upstreamBindings,
    rakePercent
  );
}

module.exports = {
  roundMoney,
  clampPercent,
  agentPercentageRate,
  buildAgentPathFromPlayer,
  buildAgentPathFromSelf,
  isWinAttributedToTarget,
  flowFromSourceToViewer,
  computeViewerSelfDrawRakeForRow,
  computeViewerSelfDrawRakeByMember,
  buildSelfDrawDisplayMap,
};
