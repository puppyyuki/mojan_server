/**
 * 俱樂部代理配額驗證：
 * 每條從總代理往下的垂直分支獨立加總，不把兄弟分支互相扣額。
 */

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampQuota(value) {
  return Math.max(0, numberOrZero(value));
}

function formatQuota(value) {
  const n = Math.max(0, numberOrZero(value));
  if (Math.abs(n - Math.round(n)) < 0.000001) return String(Math.round(n));
  return String(Math.round(n * 100) / 100).replace(/\.?0+$/, '');
}

function quotaExceededMessage(remainingPercentage, remainingRoomCards) {
  return `您目前可分配的%數為：${formatQuota(remainingPercentage)}，可分配的房卡數為：${formatQuota(remainingRoomCards)}`;
}

function buildBindingMap(bindings) {
  return new Map((bindings || []).map((b) => [b.playerId, { ...b }]));
}

function applyTargetBinding(bindings, targetPlayerId, updates) {
  const byPlayer = buildBindingMap(bindings);
  const existing = byPlayer.get(targetPlayerId) || {
    playerId: targetPlayerId,
    upstreamAgentPlayerId: updates.upstreamAgentPlayerId ?? null,
    agentPercentage: 0,
    agentRoomCardFee: 0,
  };

  byPlayer.set(targetPlayerId, {
    ...existing,
    upstreamAgentPlayerId:
      updates.upstreamAgentPlayerId !== undefined
        ? updates.upstreamAgentPlayerId
        : existing.upstreamAgentPlayerId,
    agentPercentage:
      updates.agentPercentage !== undefined
        ? updates.agentPercentage
        : existing.agentPercentage,
    agentRoomCardFee:
      updates.agentRoomCardFee !== undefined
        ? updates.agentRoomCardFee
        : existing.agentRoomCardFee,
  });

  return Array.from(byPlayer.values());
}

function buildChildrenMap(bindings) {
  const children = new Map();
  for (const binding of bindings || []) {
    const upstream = binding.upstreamAgentPlayerId;
    if (!upstream) continue;
    if (!children.has(upstream)) children.set(upstream, []);
    children.get(upstream).push(binding.playerId);
  }
  return children;
}

function ancestorConsumedBeforeTarget(targetPlayerId, bindingByPlayer, field) {
  const target = bindingByPlayer.get(targetPlayerId);
  let current = target?.upstreamAgentPlayerId ?? null;
  let sum = 0;
  const visited = new Set();

  while (current && !visited.has(current)) {
    visited.add(current);
    const binding = bindingByPlayer.get(current);
    if (!binding) break;
    if (binding.upstreamAgentPlayerId) {
      sum += clampQuota(binding[field]);
    }
    current = binding.upstreamAgentPlayerId ?? null;
  }

  return sum;
}

function maxDescendantBranchConsumed(targetPlayerId, bindings, field) {
  const bindingByPlayer = buildBindingMap(bindings);
  const children = buildChildrenMap(bindings);

  function walk(playerId, visited) {
    if (visited.has(playerId)) return 0;
    const nextVisited = new Set(visited);
    nextVisited.add(playerId);

    const childIds = children.get(playerId) || [];
    let maxChildBranch = 0;
    for (const childId of childIds) {
      const child = bindingByPlayer.get(childId);
      if (!child) continue;
      const childBranch =
        clampQuota(child[field]) + walk(childId, nextVisited);
      maxChildBranch = Math.max(maxChildBranch, childBranch);
    }
    return maxChildBranch;
  }

  return walk(targetPlayerId, new Set());
}

function computeAvailableForTarget(bindings, targetPlayerId, totalQuota, field) {
  const bindingByPlayer = buildBindingMap(bindings);
  const ancestorUsed = ancestorConsumedBeforeTarget(
    targetPlayerId,
    bindingByPlayer,
    field
  );
  const descendantUsed = maxDescendantBranchConsumed(
    targetPlayerId,
    bindings,
    field
  );
  return Math.max(0, clampQuota(totalQuota) - ancestorUsed - descendantUsed);
}

function validateAgentBranchQuota({
  bindings,
  targetPlayerId,
  upstreamAgentPlayerId,
  agentPercentage,
  agentRoomCardFee,
  totalPercentage,
  totalRoomCards,
}) {
  const appliedBindings = applyTargetBinding(bindings, targetPlayerId, {
    upstreamAgentPlayerId,
    agentPercentage,
    agentRoomCardFee,
  });
  const bindingByPlayer = buildBindingMap(appliedBindings);
  const target = bindingByPlayer.get(targetPlayerId);
  const nextPercentage = clampQuota(target?.agentPercentage);
  const nextRoomCards = clampQuota(target?.agentRoomCardFee);

  const remainingPercentage = computeAvailableForTarget(
    appliedBindings,
    targetPlayerId,
    totalPercentage,
    'agentPercentage'
  );
  const remainingRoomCards = computeAvailableForTarget(
    appliedBindings,
    targetPlayerId,
    totalRoomCards,
    'agentRoomCardFee'
  );
  const ok =
    nextPercentage <= remainingPercentage + 0.000001 &&
    nextRoomCards <= remainingRoomCards + 0.000001;

  return {
    ok,
    remainingPercentage,
    remainingRoomCards,
    message: ok
      ? null
      : quotaExceededMessage(remainingPercentage, remainingRoomCards),
  };
}

module.exports = {
  computeAvailableForTarget,
  formatQuota,
  quotaExceededMessage,
  validateAgentBranchQuota,
};
