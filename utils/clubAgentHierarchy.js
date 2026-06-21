/**
 * 俱樂部代理樹：層級判定、可任命層級、子樹可見範圍。
 */

const {
  AGENT_LEVEL_ORDER,
  PROMOTABLE_LEVELS,
  levelOrder,
  isValidPromotableLevel,
  getAssignableAgentLevels,
  isSuperAgentLevel,
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

/**
 * targetId 是否為 actorId 在代理樹上的上層代理（不含自身）。
 */
function isAncestorAgent(actorId, targetId, bindings) {
  if (!actorId || !targetId || actorId === targetId) return false;
  const byPlayer = new Map(bindings.map((b) => [b.playerId, b]));
  let cur = byPlayer.get(actorId);
  while (cur?.upstreamAgentPlayerId) {
    const up = cur.upstreamAgentPlayerId;
    if (up === targetId) return true;
    cur = byPlayer.get(up);
  }
  return false;
}

function resolveMemberUpstreamAgentPlayerId(playerId, bindings, upstreamBindings) {
  const agentBinding = bindings.find((b) => b.playerId === playerId);
  if (agentBinding?.upstreamAgentPlayerId) {
    return agentBinding.upstreamAgentPlayerId;
  }
  const playerUpstream = upstreamBindings.find((b) => b.playerId === playerId);
  return playerUpstream?.upstreamAgentPlayerId ?? null;
}

/**
 * 是否為「上層以上代理」的直屬玩家（非代理身分成員）。
 */
function isDirectPlayerOfUpstreamAgent(actorId, targetPlayerId, bindings, upstreamBindings) {
  const upstreamId = resolveMemberUpstreamAgentPlayerId(
    targetPlayerId,
    bindings,
    upstreamBindings
  );
  if (!upstreamId) return false;
  const targetBinding = bindings.find((b) => b.playerId === targetPlayerId);
  if (targetBinding?.agentLevel) return false;
  return isAncestorAgent(actorId, upstreamId, bindings);
}

/**
 * 管理頁：底台、分數上限、禁止遊戲、禁止同桌等是否不可編輯。
 */
function isManageRestrictedMemberEditBlocked(
  actorId,
  targetId,
  clubCreatorId,
  bindings,
  upstreamBindings
) {
  if (!actorId || !targetId) return false;
  if (actorId === clubCreatorId) return false;
  if (isAncestorAgent(actorId, targetId, bindings)) return true;
  if (isDirectPlayerOfUpstreamAgent(actorId, targetId, bindings, upstreamBindings)) {
    return true;
  }
  return false;
}

function assertManageRestrictedMemberEditAllowed(
  actorPlayerId,
  targetPlayerId,
  clubCreatorId,
  bindings,
  upstreamBindings
) {
  if (
    isManageRestrictedMemberEditBlocked(
      actorPlayerId,
      targetPlayerId,
      clubCreatorId,
      bindings,
      upstreamBindings
    )
  ) {
    return {
      ok: false,
      status: 403,
      error: '無法修改上層代理或其直屬玩家的此項設定',
    };
  }
  return { ok: true };
}

/**
 * 管理頁成員列表：隱藏總代理 playerId 集合。
 */
function collectSuperAgentPlayerIds(bindings) {
  const superIds = new Set();
  for (const b of bindings) {
    if (isSuperAgentLevel(b.agentLevel)) {
      superIds.add(b.playerId);
    }
  }
  return superIds;
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
  isAncestorAgent,
  isDirectPlayerOfUpstreamAgent,
  isManageRestrictedMemberEditBlocked,
  assertManageRestrictedMemberEditAllowed,
  collectSuperAgentPlayerIds,
  DEFAULT_CO_LEADER_PERMISSIONS,
  ensureCreatorSuperBinding,
  loadClubAgentBindings,
  loadPlayerClubUpstreamBindings,
};
