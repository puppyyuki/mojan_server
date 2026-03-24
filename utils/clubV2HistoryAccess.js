/**
 * 俱樂部 v2 對戰歷史／戰績詳情可見性：
 * - 擁有者、副會長 (CO_LEADER)、已核准之公關代理 (agentLevel=vip)：可看同俱樂部全部場次
 * - 其餘成員：僅能看自己有參與 (V2MatchParticipant) 的場次
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, creatorId: string }} club
 * @param {string} actorPlayerId
 * @returns {Promise<{ ok: true, canSeeAll: boolean } | { ok: false, status: number, message: string }>}
 */
async function resolveClubV2HistoryVisibility(prisma, club, actorPlayerId) {
  const pid = (actorPlayerId || '').toString().trim();
  if (!pid) {
    return { ok: false, status: 400, message: '請提供 actorPlayerId' };
  }

  const member = await prisma.clubMember.findUnique({
    where: {
      clubId_playerId: { clubId: club.id, playerId: pid },
    },
    select: { role: true },
  });

  if (!member) {
    return { ok: false, status: 403, message: '非俱樂部成員' };
  }

  if (club.creatorId === pid) {
    return { ok: true, canSeeAll: true };
  }

  if (member.role === 'CO_LEADER') {
    return { ok: true, canSeeAll: true };
  }

  const vipApp = await prisma.agentApplication.findFirst({
    where: {
      playerId: pid,
      status: 'approved',
      agentLevel: 'vip',
    },
    select: { id: true },
  });

  if (vipApp) {
    return { ok: true, canSeeAll: true };
  }

  return { ok: true, canSeeAll: false };
}

/**
 * 俱樂部成員讀取「非自己參與」的 v2 戰績／重播：須 canSeeAll
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string|null|undefined} clubInternalId
 * @param {string} actorPlayerId
 * @param {boolean} isSessionParticipant
 */
async function mayReadClubV2MatchAsNonParticipant(
  prisma,
  clubInternalId,
  actorPlayerId,
  isSessionParticipant
) {
  if (isSessionParticipant) {
    return true;
  }
  if (!clubInternalId) {
    return false;
  }
  const club = await prisma.club.findUnique({
    where: { id: clubInternalId },
    select: { id: true, creatorId: true },
  });
  if (!club) {
    return false;
  }
  const vis = await resolveClubV2HistoryVisibility(prisma, club, actorPlayerId);
  if (!vis.ok) {
    return false;
  }
  return vis.canSeeAll === true;
}

module.exports = {
  resolveClubV2HistoryVisibility,
  mayReadClubV2MatchAsNonParticipant,
};
