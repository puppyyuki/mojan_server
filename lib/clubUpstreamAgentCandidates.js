/**
 * 依俱樂部 AgentClubBinding 列出可選上層代理（八階層級標籤）。
 */

const { agentLevelLabelZh } = require('./agent-level-labels.shared.js');
const { loadClubAgentBindings } = require('../utils/clubAgentHierarchy');

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   clubInternalId: string;
 *   creatorId: string;
 *   excludePlayerId?: string | null;
 *   searchRaw?: string;
 * }} opts
 * @returns {Promise<Array<{
 *   playerId: string;
 *   userId: string;
 *   nickname: string;
 *   agentLevel: string;
 *   agentLevelLabel: string;
 * }>>}
 */
async function listClubUpstreamAgentCandidates(prisma, opts) {
  const {
    clubInternalId,
    creatorId,
    excludePlayerId = null,
    searchRaw = '',
  } = opts;

  const bindings = await loadClubAgentBindings(prisma, clubInternalId);
  const seen = new Set();
  /** @type {Array<{ playerId: string; userId: string; nickname: string; agentLevel: string; agentLevelLabel: string }>} */
  let candidates = [];

  for (const b of bindings) {
    if (!b.playerId || b.playerId === excludePlayerId || seen.has(b.playerId)) {
      continue;
    }
    seen.add(b.playerId);
    candidates.push({
      playerId: b.player.id,
      userId: b.player.userId,
      nickname: b.player.nickname,
      agentLevel: b.agentLevel,
      agentLevelLabel: agentLevelLabelZh(b.agentLevel),
    });
  }

  if (
    creatorId &&
    creatorId !== excludePlayerId &&
    !seen.has(creatorId)
  ) {
    const creator = await prisma.player.findUnique({
      where: { id: creatorId },
      select: { id: true, userId: true, nickname: true },
    });
    if (creator) {
      const creatorBinding = bindings.find((row) => row.playerId === creatorId);
      candidates.unshift({
        playerId: creator.id,
        userId: creator.userId,
        nickname: creator.nickname,
        agentLevel: creatorBinding?.agentLevel ?? 'super',
        agentLevelLabel: agentLevelLabelZh(
          creatorBinding?.agentLevel ?? 'super'
        ),
      });
    }
  }

  const q = String(searchRaw ?? '').trim().toLowerCase();
  if (q) {
    candidates = candidates.filter((c) => {
      const n = (c.nickname || '').toLowerCase();
      const u = (c.userId || '').toLowerCase();
      const pid = (c.playerId || '').toLowerCase();
      const lab = (c.agentLevelLabel || '').toLowerCase();
      return (
        n.includes(q) ||
        u.includes(q) ||
        pid.includes(q) ||
        lab.includes(q)
      );
    });
  }

  return candidates;
}

module.exports = {
  listClubUpstreamAgentCandidates,
};
