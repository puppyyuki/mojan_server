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

function clubSelfDrawRakePercentNumber(p) {
  if (p == null || !Number.isFinite(Number(p))) return DEFAULT_SELF_DRAW_RAKE_PERCENT;
  return Math.min(100, Math.max(0, Number(p)));
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

function buildRoundWhereForClub(clubInternalId, range) {
  const roundWhere = {
    session: {
      clubId: clubInternalId,
      status: { in: ['FINISHED', 'DISBANDED'] },
    },
  };
  const startAt = range?.startAt ?? null;
  const endAt = range?.endAt ?? null;
  if (startAt || endAt) {
    roundWhere.endedAt = {};
    if (startAt) roundWhere.endedAt.gte = startAt;
    if (endAt) roundWhere.endedAt.lte = endAt;
  }
  return roundWhere;
}

/**
 * 依小局 endedAt 區間聚合（與排行榜日期篩選一致）。
 * @returns {{ winByPlayer: Map<string, number>, poolByPlayer: Map<string, number>, rakePercent: number }}
 *   winByPlayer = 自摸正分加總；poolByPlayer = A = win × 俱樂部自摸抽%
 */
async function aggregateSelfDrawStatsByPlayerId(prisma, club, range) {
  const rakePercent = clubSelfDrawRakePercentNumber(club.selfDrawRakePercent);
  const selfDrawRakeRate = rakePercent / 100;

  const clubRounds = await prisma.v2MatchRound.findMany({
    where: buildRoundWhereForClub(club.id, range),
    select: {
      roundEndPayload: true,
      scoreChangeBySeat: true,
      session: {
        select: {
          participants: {
            select: { playerId: true, seat: true },
          },
        },
      },
    },
  });

  const winByPlayer = new Map();
  const poolByPlayer = new Map();

  for (const round of clubRounds) {
    const winnerSeat = selfDrawWinnerSeatFromRoundEndPayload(round.roundEndPayload);
    if (winnerSeat == null) continue;

    const participants = round.session?.participants ?? [];
    const seatToParticipant = new Map(
      participants.map((p) => [p.seat, { playerId: p.playerId }])
    );
    const winner = seatToParticipant.get(winnerSeat);
    if (!winner?.playerId) continue;

    const winDelta = seatScoreDelta(round.scoreChangeBySeat, winnerSeat);
    const winForRake = winDelta > 0 ? winDelta : 0;
    if (winForRake <= 0) continue;

    const pid = winner.playerId;
    winByPlayer.set(pid, (winByPlayer.get(pid) || 0) + winForRake);
    poolByPlayer.set(pid, (poolByPlayer.get(pid) || 0) + winForRake * selfDrawRakeRate);
  }

  return { winByPlayer, poolByPlayer, rakePercent };
}

/**
 * @returns {Promise<Map<string, number>>} playerId -> 累計自摸抽池 A（未四捨五入）
 */
async function sumSelfDrawRakeMoneyByPlayerId(prisma, club, range) {
  const { poolByPlayer } = await aggregateSelfDrawStatsByPlayerId(prisma, club, range);
  return poolByPlayer;
}

module.exports = {
  sumSelfDrawRakeMoneyByPlayerId,
  aggregateSelfDrawStatsByPlayerId,
  selfDrawRakeDecimalFromPercent,
  clubSelfDrawRakePercentNumber,
};
