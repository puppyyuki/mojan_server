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

function activeAgentRoomCardFee(binding, branchRoomCardEnabled) {
  if (branchRoomCardEnabled === true) {
    return Math.max(0, numberOrZero(binding?.branchAgentRoomCardFee));
  }
  return Math.max(0, numberOrZero(binding?.agentRoomCardFee));
}

function projectActiveAgentRoomCardFees(bindings, branchRoomCardEnabled) {
  return (bindings || []).map((binding) => ({
    ...binding,
    agentRoomCardFee: activeAgentRoomCardFee(binding, branchRoomCardEnabled),
  }));
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

function computeViewerRoomCardFeeForRow({
  targetPlayerId,
  roomCardConsumedByPlayer,
  bindings,
  upstreamBindings = [],
  clubRoomCardFee,
  branchRoomCardEnabled,
  branchFees = [],
}) {
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

function buildAgentChildrenMap(bindings) {
  const children = new Map();
  for (const binding of bindings || []) {
    const upstream = binding.upstreamAgentPlayerId;
    if (!upstream) continue;
    const list = children.get(upstream) || [];
    list.push(binding.playerId);
    children.set(upstream, list);
  }
  return children;
}

function buildDirectPlayerChildrenMap(bindings, upstreamBindings) {
  const agentIds = new Set((bindings || []).map((binding) => binding.playerId));
  const children = new Map();
  for (const binding of upstreamBindings || []) {
    if (agentIds.has(binding.playerId)) continue;
    const list = children.get(binding.upstreamAgentPlayerId) || [];
    list.push(binding.playerId);
    children.set(binding.upstreamAgentPlayerId, list);
  }
  return children;
}

function subtreeRoomCardConsumed(
  rootPlayerId,
  roomCardConsumedByPlayer,
  agentChildrenByPlayer,
  directPlayersByAgent
) {
  let total = 0;
  const stack = [rootPlayerId];
  const seen = new Set();
  while (stack.length) {
    const playerId = stack.pop();
    if (!playerId || seen.has(playerId)) continue;
    seen.add(playerId);

    total += Math.abs(numberOrZero(roomCardConsumedByPlayer.get(playerId)));
    stack.push(...(agentChildrenByPlayer.get(playerId) || []));
    stack.push(...(directPlayersByAgent.get(playerId) || []));
  }
  return total;
}

function computeDownlineRoomCardFeeForAgent({
  targetPlayerId,
  roomCardConsumedByPlayer,
  bindings,
  upstreamBindings = [],
  clubRoomCardFee,
  branchRoomCardEnabled,
  branchFees = [],
}) {
  const bindingByPlayer = buildBindingMap(bindings);
  if (!bindingByPlayer.has(targetPlayerId)) return 0;

  const agentChildrenByPlayer = buildAgentChildrenMap(bindings);
  const directPlayersByAgent = buildDirectPlayerChildrenMap(bindings, upstreamBindings);
  let total = 0;

  for (const playerId of directPlayersByAgent.get(targetPlayerId) || []) {
    const fee = resolveEffectiveRoomCardFee({
      clubRoomCardFee,
      branchRoomCardEnabled,
      playerId,
      bindings,
      upstreamBindings,
      branchFees,
    });
    total += Math.abs(numberOrZero(roomCardConsumedByPlayer.get(playerId))) * fee;
  }

  for (const childAgentId of agentChildrenByPlayer.get(targetPlayerId) || []) {
    const childBinding = bindingByPlayer.get(childAgentId);
    const fee = activeAgentRoomCardFee(childBinding, branchRoomCardEnabled);
    const consumed = subtreeRoomCardConsumed(
      childAgentId,
      roomCardConsumedByPlayer,
      agentChildrenByPlayer,
      directPlayersByAgent
    );
    total += consumed * fee;
  }

  return roundMoney(total);
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
  activeAgentRoomCardFee,
  computeDownlineRoomCardFeeForAgent,
  computeViewerRoomCardFeeForRow,
  computeOwnRoomCardFeeAmount,
  projectActiveAgentRoomCardFees,
  resolveEffectiveRoomCardFee,
  resolveMasterAgentPlayerId,
  resolveRoomCardQuotaLimitForTarget,
};
