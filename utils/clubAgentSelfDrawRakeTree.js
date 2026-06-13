/**
 * 俱樂部成員列表「自摸抽」欄位顯示值（觀看者 actor 視角）。
 *
 * - 俱樂部 selfDrawRakePercent（後台「俱樂部管理 > 編輯」）為 a%，上繳池 A = 自摸贏分 × a%
 * - 代理 agentPercentage 為原始贏分百分點 z%，換算成池內比例 z/a 後往上分配
 *
 * 三種列語意：
 *   1. 直屬玩家列：該玩家區間自摸 × a%（總池，不拆分）
 *   2. 看自己（第一列）：本人自摸 × (a−y)% + 直屬玩家 × (a−y)% + 隔代玩家 × z% + 下線代理自摸 × z%
 *   3. 直屬下線代理列：該下線子樹內所有自摸（含下線本人）× 觀看者替其設定的 z%
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

/** target 是否為 actor 的直屬玩家（非代理，且第一層 upstream 為 actor）。 */
function isDirectPlayerOf(
  actorPlayerId,
  targetPlayerId,
  bindingByPlayer,
  upstreamBindingsByPlayer,
  isAgent
) {
  if (isAgent(targetPlayerId)) return false;
  return (
    resolveFirstUpstream(
      targetPlayerId,
      bindingByPlayer,
      upstreamBindingsByPlayer
    ) === actorPlayerId
  );
}

/** target 是否為 actor 的直屬下線代理。 */
function isDirectDownlineAgentOf(actorPlayerId, targetPlayerId, bindingByPlayer) {
  const binding = bindingByPlayer.get(targetPlayerId);
  return binding?.upstreamAgentPlayerId === actorPlayerId;
}

/** 代理本人自摸保留比例（池內 (a−y)%）。 */
function computeAgentSelfKeepRate(agentId, clubRakePercent, bindingByPlayer) {
  const path = buildAgentPathFromSelf(agentId, bindingByPlayer);
  let remitSumRate = 0;
  for (const id of path) {
    const binding = bindingByPlayer.get(id);
    remitSumRate += agentPercentageRate(
      binding?.agentPercentage,
      clubRakePercent
    );
  }
  return Math.max(0, 1 - remitSumRate);
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

  if (
    isDirectPlayerOf(
      actorPlayerId,
      targetPlayerId,
      bindingByPlayer,
      upstreamBindingsByPlayer,
      isAgent
    )
  ) {
    return resolvePoolAmount(
      winByPlayer.get(targetPlayerId),
      poolByPlayer.get(targetPlayerId),
      rakeRate
    );
  }

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

    if (
      actorPlayerId === targetPlayerId &&
      sourceId === actorPlayerId &&
      isAgent(actorPlayerId)
    ) {
      total = roundMoney(
        total +
          a *
            computeAgentSelfKeepRate(
              actorPlayerId,
              clubRakePercent,
              bindingByPlayer
            )
      );
      continue;
    }

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
  isDirectPlayerOf,
  isDirectDownlineAgentOf,
  computeAgentSelfKeepRate,
  isWinAttributedToTarget,
  flowFromSourceToViewer,
  computeViewerSelfDrawRakeForRow,
  computeViewerSelfDrawRakeByMember,
  buildSelfDrawDisplayMap,
};
