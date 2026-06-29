/**
 * 俱樂部分支房卡：解析玩家/代理所屬的大代理分支與有效房卡費。
 */

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(numberOrZero(value) * 100) / 100;
}

function buildBindingMap(bindings) {
  return new Map((bindings || []).map((b) => [b.playerId, { ...b }]));
}

function buildUpstreamMap(upstreamBindings) {
  return new Map((upstreamBindings || []).map((b) => [b.playerId, b.upstreamAgentPlayerId]));
}

function buildBranchFeeMap(branchFees) {
  return new Map(
    (branchFees || []).map((row) => [
      row.masterAgentPlayerId,
      Math.max(0, numberOrZero(row.branchRoomCardFee)),
    ])
  );
}

function applyTargetBinding(bindings, targetPlayerId, updates = {}) {
  if (!targetPlayerId) return bindings || [];
  const byPlayer = buildBindingMap(bindings);
  const existing = byPlayer.get(targetPlayerId) || {
    playerId: targetPlayerId,
    upstreamAgentPlayerId: null,
    agentLevel: updates.agentLevel ?? null,
  };

  byPlayer.set(targetPlayerId, {
    ...existing,
    upstreamAgentPlayerId:
      updates.upstreamAgentPlayerId !== undefined
        ? updates.upstreamAgentPlayerId
        : existing.upstreamAgentPlayerId,
    agentLevel:
      updates.agentLevel !== undefined ? updates.agentLevel : existing.agentLevel,
  });

  return Array.from(byPlayer.values());
}

function resolveFirstUpstream(playerId, bindingByPlayer, upstreamByPlayer) {
  const playerUpstream = upstreamByPlayer.get(playerId);
  if (playerUpstream) return playerUpstream;
  const binding = bindingByPlayer.get(playerId);
  return binding?.upstreamAgentPlayerId ?? null;
}

function resolveMasterAgentPlayerId(
  playerId,
  bindings,
  upstreamBindings = [],
  targetOverride = null
) {
  const appliedBindings = targetOverride
    ? applyTargetBinding(bindings, targetOverride.targetPlayerId, targetOverride)
    : bindings || [];
  const bindingByPlayer = buildBindingMap(appliedBindings);
  const upstreamByPlayer = buildUpstreamMap(upstreamBindings);
  const visited = new Set();
  let current = playerId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const binding = bindingByPlayer.get(current);
    if (binding?.agentLevel === 'master') return current;
    current = binding
      ? binding.upstreamAgentPlayerId ?? null
      : resolveFirstUpstream(current, bindingByPlayer, upstreamByPlayer);
  }

  return null;
}

function resolveEffectiveRoomCardFee({
  clubRoomCardFee,
  branchRoomCardEnabled,
  playerId,
  bindings,
  upstreamBindings = [],
  branchFees = [],
}) {
  const clubFee = Math.max(0, numberOrZero(clubRoomCardFee));
  if (!branchRoomCardEnabled) return clubFee;

  const masterAgentPlayerId = resolveMasterAgentPlayerId(
    playerId,
    bindings,
    upstreamBindings
  );
  if (!masterAgentPlayerId) return 0;
  return buildBranchFeeMap(branchFees).get(masterAgentPlayerId) ?? 0;
}

function isSourceAttributedToTarget(sourceId, targetId, bindings, upstreamBindings = []) {
  if (sourceId === targetId) return true;
  const bindingByPlayer = buildBindingMap(bindings);
  const upstreamByPlayer = buildUpstreamMap(upstreamBindings);
  const visited = new Set();
  let current = sourceId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const upstream = resolveFirstUpstream(current, bindingByPlayer, upstreamByPlayer);
    if (upstream === targetId) return true;
    if (!upstream) break;
    current = upstream;
  }

  return false;
}

function computeViewerRoomCardFeeForRow({
  targetPlayerId,
  roomCardConsumedByPlayer,
  bindings,
  upstreamBindings = [],
  clubRoomCardFee,
  branchRoomCardEnabled,
  branchFees = [],
}) {
  const agentIds = new Set((bindings || []).map((b) => b.playerId));

  if (!agentIds.has(targetPlayerId)) {
    const fee = resolveEffectiveRoomCardFee({
      clubRoomCardFee,
      branchRoomCardEnabled,
      playerId: targetPlayerId,
      bindings,
      upstreamBindings,
      branchFees,
    });
    return computeOwnRoomCardFeeAmount(
      roomCardConsumedByPlayer.get(targetPlayerId) ?? 0,
      fee
    );
  }

  let total = 0;
  for (const [sourceId, consumed] of roomCardConsumedByPlayer.entries()) {
    if (!isSourceAttributedToTarget(sourceId, targetPlayerId, bindings, upstreamBindings)) {
      continue;
    }
    const fee = resolveEffectiveRoomCardFee({
      clubRoomCardFee,
      branchRoomCardEnabled,
      playerId: sourceId,
      bindings,
      upstreamBindings,
      branchFees,
    });
    total = roundMoney(total + computeOwnRoomCardFeeAmount(consumed, fee));
  }

  return total;
}

async function resolveRoomCardQuotaLimitForTarget(prisma, {
  club,
  bindings,
  targetPlayerId,
  targetAgentLevel,
  upstreamAgentPlayerId,
}) {
  const clubLimit = Math.max(0, numberOrZero(club?.cardCount));
  if (club?.branchRoomCardEnabled !== true) return clubLimit;

  const branchFees = await prisma.clubRoomCardBranchFee.findMany({
    where: { clubId: club.id },
    select: { masterAgentPlayerId: true, branchRoomCardFee: true },
  });
  const masterAgentPlayerId = resolveMasterAgentPlayerId(
    targetPlayerId,
    bindings,
    [],
    {
      targetPlayerId,
      agentLevel: targetAgentLevel,
      upstreamAgentPlayerId,
    }
  );
  if (!masterAgentPlayerId) return 0;
  return buildBranchFeeMap(branchFees).get(masterAgentPlayerId) ?? 0;
}

function computeOwnRoomCardFeeAmount(roomCardConsumed, fee) {
  return roundMoney(numberOrZero(roomCardConsumed) * Math.max(0, numberOrZero(fee)));
}

module.exports = {
  buildBranchFeeMap,
  computeViewerRoomCardFeeForRow,
  computeOwnRoomCardFeeAmount,
  resolveEffectiveRoomCardFee,
  resolveMasterAgentPlayerId,
  resolveRoomCardQuotaLimitForTarget,
};
