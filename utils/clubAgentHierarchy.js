/**
 * 俱樂部代理樹：層級判定、可任命層級、子樹可見範圍。
 */

const {
  AGENT_LEVEL_ORDER,
  PROMOTABLE_LEVELS,
  levelOrder,
  isValidPromotableLevel,
  getAssignableAgentLevels,
} = require('../lib/agent-levels.shared.js');

/**
 * @param {Array<{ playerId: string, upstreamAgentPlayerId: string|null, agentLevel: string }>} bindings
 */
function buildChildrenMap(bindings) {
  const children = new Map();
  for (const b of bindings) {
    const up = b.upstreamAgentPlayerId;
    if (!up) continue;
    if (!children.has(up)) children.set(up, []);
    children.get(up).push(b.playerId);
  }
  return children;
}

/**
 * 收集 rootId 自身與所有樹狀後裔 playerId。
 */
function collectDescendantPlayerIds(rootId, bindings) {
  const set = new Set();
  if (!rootId) return set;
  const childrenMap = buildChildrenMap(bindings);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (set.has(id)) continue;
    set.add(id);
    const kids = childrenMap.get(id) || [];
    for (const k of kids) stack.push(k);
  }
  return set;
}

/**
 * 解析玩家在俱樂部的上層代理層級（優先 AgentClubBinding，其次 PlayerClubUpstreamBinding 的上層 binding）。
 */
async function resolveUpstreamLevel(prisma, clubInternalId, targetPlayerId) {
  const targetBinding = await prisma.agentClubBinding.findUnique({
    where: {
      playerId_clubId: { playerId: targetPlayerId, clubId: clubInternalId },
    },
    select: {
      upstreamAgentPlayerId: true,
      agentLevel: true,
    },
  });

  let upstreamPlayerId = targetBinding?.upstreamAgentPlayerId ?? null;

  if (!upstreamPlayerId) {
    const upstreamBinding = await prisma.playerClubUpstreamBinding.findUnique({
      where: {
        playerId_clubId: { playerId: targetPlayerId, clubId: clubInternalId },
      },
      select: { upstreamAgentPlayerId: true },
    });
    upstreamPlayerId = upstreamBinding?.upstreamAgentPlayerId ?? null;
  }

  if (!upstreamPlayerId) return null;

  const upBinding = await prisma.agentClubBinding.findUnique({
    where: {
      playerId_clubId: { playerId: upstreamPlayerId, clubId: clubInternalId },
    },
    select: { agentLevel: true },
  });

  if (upBinding?.agentLevel) return upBinding.agentLevel;

  if (targetBinding?.upstreamAgentPlayerId === null && targetBinding?.agentLevel === 'super') {
    return null;
  }

  return null;
}

/**
 * 將 PlayerClubUpstreamBinding 中上層已在可見集合的成員納入（底層玩家）。
 */
function expandVisibleWithUpstreamBindings(visibleIds, upstreamBindings) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of upstreamBindings) {
      if (
        row.upstreamAgentPlayerId &&
        visibleIds.has(row.upstreamAgentPlayerId) &&
        !visibleIds.has(row.playerId)
      ) {
        visibleIds.add(row.playerId);
        changed = true;
      }
    }
  }
  return visibleIds;
}

/**
 * 成員列表可見範圍：自身 + 直屬代理下線 + 直屬玩家（不含更下層）。
 * @param {Array<{ playerId: string, upstreamAgentPlayerId: string|null }>} bindings
 * @param {Array<{ playerId: string, upstreamAgentPlayerId: string }>} [upstreamBindings]
 * @returns {Set<string>}
 */
function resolveAgentMemberListVisiblePlayerIds(
  actorPlayerId,
  bindings,
  upstreamBindings = []
) {
  const visible = new Set([actorPlayerId]);

  for (const b of bindings) {
    if (b.upstreamAgentPlayerId === actorPlayerId) {
      visible.add(b.playerId);
    }
  }

  for (const row of upstreamBindings) {
    if (row.upstreamAgentPlayerId === actorPlayerId) {
      visible.add(row.playerId);
    }
  }

  return visible;
}

/**
 * 取得操作者可見的 playerId 集合（完整子樹，供管理成員等）。
 * @param {Array<{ playerId: string, upstreamAgentPlayerId: string }>} [upstreamBindings]
 */
function resolveVisiblePlayerIds(
  actorPlayerId,
  clubCreatorId,
  bindings,
  upstreamBindings = []
) {
  const isOwner = actorPlayerId === clubCreatorId;
  if (isOwner) {
    return { isOwner: true, visibleIds: null };
  }

  const actorBinding = bindings.find((b) => b.playerId === actorPlayerId);
  const visible = actorBinding
    ? collectDescendantPlayerIds(actorPlayerId, bindings)
    : new Set([actorPlayerId]);

  expandVisibleWithUpstreamBindings(visible, upstreamBindings);
  return { isOwner: false, visibleIds: visible };
}

async function loadPlayerClubUpstreamBindings(prisma, clubInternalId) {
  return prisma.playerClubUpstreamBinding.findMany({
    where: { clubId: clubInternalId },
    select: {
      playerId: true,
      upstreamAgentPlayerId: true,
      upstreamAgent: {
        select: { id: true, userId: true, nickname: true },
      },
    },
  });
}

/**
 * 判斷 actor 是否為 target 的直屬上層。
 */
function isDirectUpstream(actorPlayerId, targetPlayerId, bindings) {
  const target = bindings.find((b) => b.playerId === targetPlayerId);
  return target?.upstreamAgentPlayerId === actorPlayerId;
}

const DEFAULT_CO_LEADER_PERMISSIONS = {
  modifyClubRules: true,
  approveJoinRequests: true,
  kickMembers: true,
  banMembers: true,
  banSameTable: true,
  setScoreLimit: true,
  setBaseTaiLimit: true,
  manageRoomCards: false,
};

async function ensureCreatorSuperBinding(prisma, clubInternalId, creatorPlayerId) {
  const existing = await prisma.agentClubBinding.findUnique({
    where: {
      playerId_clubId: { playerId: creatorPlayerId, clubId: clubInternalId },
    },
  });
  if (existing) return existing;
  return prisma.agentClubBinding.create({
    data: {
      playerId: creatorPlayerId,
      clubId: clubInternalId,
      agentLevel: 'super',
      upstreamAgentPlayerId: null,
      agentRoomCardFee: 0,
      agentPercentage: 0,
    },
  });
}

async function loadClubAgentBindings(prisma, clubInternalId) {
  return prisma.agentClubBinding.findMany({
    where: { clubId: clubInternalId },
    select: {
      id: true,
      playerId: true,
      upstreamAgentPlayerId: true,
      agentLevel: true,
      agentRoomCardFee: true,
      agentPercentage: true,
      upstreamAgent: {
        select: { id: true, userId: true, nickname: true },
      },
      player: {
        select: { id: true, userId: true, nickname: true },
      },
    },
  });
}

module.exports = {
  AGENT_LEVEL_ORDER,
  PROMOTABLE_LEVELS,
  levelOrder,
  isValidPromotableLevel,
  getAssignableAgentLevels,
  buildChildrenMap,
  collectDescendantPlayerIds,
  expandVisibleWithUpstreamBindings,
  resolveUpstreamLevel,
  resolveVisiblePlayerIds,
  resolveAgentMemberListVisiblePlayerIds,
  isDirectUpstream,
  DEFAULT_CO_LEADER_PERMISSIONS,
  ensureCreatorSuperBinding,
  loadClubAgentBindings,
  loadPlayerClubUpstreamBindings,
};
