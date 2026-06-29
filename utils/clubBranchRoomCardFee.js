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

function buildAgentPathFromPlayer(playerId, bindingByPlayer, upstreamByPlayer) {
  const path = [];
  const visited = new Set();
  let current = resolveFirstUpstream(playerId, bindingByPlayer, upstreamByPlayer);

  while (current && !visited.has(current)) {
    visited.add(current);
    if (bindingByPlayer.has(current)) path.push(current);
    const binding = bindingByPlayer.get(current);
    current = binding?.upstreamAgentPlayerId ?? null;
  }

  return path;
}

function buildAgentPathFromSelf(agentId, bindingByPlayer) {
  const path = [];
  const visited = new Set();
  let current = agentId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const binding = bindingByPlayer.get(current);
    if (!binding) break;
    path.push(current);
    current = binding.upstreamAgentPlayerId ?? null;
  }

  return path;
}

function agentRoomCardFeeRate(agentRoomCardFee, totalRoomCardFee) {
  const total = Math.max(0, numberOrZero(totalRoomCardFee));
  if (total <= 0) return 0;
  const fee = Math.min(total, Math.max(0, numberOrZero(agentRoomCardFee)));
  return fee / total;
}

function computeAgentSelfKeepRate(agentId, totalRoomCardFee, bindingByPlayer) {
  const path = buildAgentPathFromSelf(agentId, bindingByPlayer);
  let remitSumRate = 0;
  for (const id of path) {
    const binding = bindingByPlayer.get(id);
    remitSumRate += agentRoomCardFeeRate(
      binding?.agentRoomCardFee,
      totalRoomCardFee
    );
  }
  return Math.max(0, 1 - remitSumRate);
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
  const bindingByPlayer = buildBindingMap(bindings);
  const upstreamByPlayer = buildUpstreamMap(upstreamBindings);
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
    const sourceTotalFee = resolveEffectiveRoomCardFee({
      clubRoomCardFee,
      branchRoomCardEnabled,
      playerId: sourceId,
      bindings,
      upstreamBindings,
      branchFees,
    });
    const sourceAmount = computeOwnRoomCardFeeAmount(consumed, sourceTotalFee);

    if (agentIds.has(sourceId)) {
      if (sourceId === targetPlayerId) {
        total = roundMoney(
          total +
            sourceAmount *
              computeAgentSelfKeepRate(targetPlayerId, sourceTotalFee, bindingByPlayer)
        );
        continue;
      }

      for (const agentId of buildAgentPathFromSelf(sourceId, bindingByPlayer)) {
        const binding = bindingByPlayer.get(agentId);
        if (binding?.upstreamAgentPlayerId !== targetPlayerId) continue;
        total = roundMoney(
          total +
            sourceAmount *
              agentRoomCardFeeRate(binding?.agentRoomCardFee, sourceTotalFee)
        );
      }
      continue;
    }

    const path = buildAgentPathFromPlayer(sourceId, bindingByPlayer, upstreamByPlayer);
    if (path.length === 0) continue;

    const leafAgentId = path[0];
    if (targetPlayerId === leafAgentId) {
      let parentKeepSumRate = 0;
      for (const agentId of path) {
        const binding = bindingByPlayer.get(agentId);
        parentKeepSumRate += agentRoomCardFeeRate(
          binding?.agentRoomCardFee,
          sourceTotalFee
        );
      }
      total = roundMoney(total + sourceAmount * Math.max(0, 1 - parentKeepSumRate));
      continue;
    }

    for (const agentId of path) {
      const binding = bindingByPlayer.get(agentId);
      if (binding?.upstreamAgentPlayerId !== targetPlayerId) continue;
      total = roundMoney(
        total +
          sourceAmount *
            agentRoomCardFeeRate(binding?.agentRoomCardFee, sourceTotalFee)
      );
    }
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
  const amount = roundMoney(
    Math.abs(numberOrZero(roomCardConsumed)) * Math.max(0, numberOrZero(fee))
  );
  return amount === 0 ? 0 : -amount;
}

module.exports = {
  buildBranchFeeMap,
  computeViewerRoomCardFeeForRow,
  computeOwnRoomCardFeeAmount,
  resolveEffectiveRoomCardFee,
  resolveMasterAgentPlayerId,
  resolveRoomCardQuotaLimitForTarget,
};
