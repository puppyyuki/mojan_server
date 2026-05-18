/**
 * 與後台報表 club-summary「自摸抽」(selfDrawRakeMoney) 相同計算來源：
 * 逐局自摸胡且該家當局分數變化為正者 × 俱樂部 selfDrawRakePercent。
 */

const DEFAULT_SELF_DRAW_RAKE_PERCENT = 8;

function selfDrawRakeDecimalFromPercent(p) {
  if (p == null || !Number.isFinite(Number(p))) return DEFAULT_SELF_DRAW_RAKE_PERCENT / 100;
  const clamped = Math.min(100, Math.max(0, Number(p)));
  return clamped / 100;
}

/** 該局該座位分數變化（與 rooms normalizeScoresBySeat / admin club-summary 一致） */
function seatScoreDelta(scoreChangeBySeat, seat) {
  if (!scoreChangeBySeat || typeof scoreChangeBySeat !== 'object' || Array.isArray(scoreChangeBySeat)) {
    return 0;
  }
  const o = scoreChangeBySeat;
  const v = o[seat] ?? o[String(seat)];
  return Number(v ?? 0) || 0;
}

function selfDrawWinnerSeatFromRoundEndPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payload = raw;

  if (payload.isExhaustiveDraw === true) return null;

  const winnerSeat = Number(payload.winnerSeat);
  if (!Number.isInteger(winnerSeat) || winnerSeat < 0 || winnerSeat > 3) return null;

  const fromSeat = Number(payload.fromSeat);
  if (Number.isInteger(fromSeat) && fromSeat === winnerSeat) return winnerSeat;

  const huType = typeof payload.huType === 'string' ? payload.huType.toLowerCase() : '';
  const claimType = typeof payload.claimType === 'string' ? payload.claimType.toLowerCase() : '';
  if (huType.includes('selfdraw') || claimType.includes('selfdraw')) return winnerSeat;
  if (payload.isSelfDraw === true || payload.selfDraw === true) return winnerSeat;

  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, selfDrawRakePercent?: number | null }} club
 * @param {{ startAt: Date | null | undefined, endAt: Date | null | undefined }} range  —
 *   皆為 null/undefined 時不限制 session.endedAt（全期間）
 * @returns {Promise<Map<string, number>>} playerId -> 累計自摸抽（未四捨五入）
 */
async function sumSelfDrawRakeMoneyByPlayerId(prisma, club, range) {
  const selfDrawRakeRate = selfDrawRakeDecimalFromPercent(club.selfDrawRakePercent);

  const where = {
    clubId: club.id,
    status: { in: ['FINISHED', 'DISBANDED'] },
  };
  const startAt = range?.startAt ?? null;
  const endAt = range?.endAt ?? null;
  if (startAt || endAt) {
    where.endedAt = {};
    if (startAt) where.endedAt.gte = startAt;
    if (endAt) where.endedAt.lte = endAt;
  }

  const settledSessions = await prisma.v2MatchSession.findMany({
    where,
    select: {
      participants: {
        select: {
          playerId: true,
          seat: true,
        },
      },
      rounds: {
        select: {
          roundEndPayload: true,
          scoreChangeBySeat: true,
        },
      },
    },
  });

  const totals = new Map();
  for (const sess of settledSessions) {
    const seatToParticipant = new Map(
      (sess.participants ?? []).map((p) => [p.seat, { playerId: p.playerId }])
    );
    for (const round of sess.rounds ?? []) {
      const winnerSeat = selfDrawWinnerSeatFromRoundEndPayload(round.roundEndPayload);
      if (winnerSeat == null) continue;
      const winner = seatToParticipant.get(winnerSeat);
      if (!winner?.playerId) continue;

      const winDelta = seatScoreDelta(round.scoreChangeBySeat, winnerSeat);
      const winForRake = winDelta > 0 ? winDelta : 0;
      const rakeThisRound = winForRake * selfDrawRakeRate;

      const pid = winner.playerId;
      totals.set(pid, (totals.get(pid) || 0) + rakeThisRound);
    }
  }

  return totals;
}

module.exports = {
  sumSelfDrawRakeMoneyByPlayerId,
};
