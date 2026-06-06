/**
 * 依已落庫的 v2MatchRound 加總各座位分數，與 participant.matchTotalScore 對齊。
 * 用於修復局次落庫漏寫或 participant 累加不一致時的顯示與排行比對。
 */

function seatScoreDelta(scoreChangeBySeat, seat) {
  if (!scoreChangeBySeat || typeof scoreChangeBySeat !== 'object') return 0;
  const n = Number(seat);
  const raw = scoreChangeBySeat[n] ?? scoreChangeBySeat[String(n)];
  return Number(raw) || 0;
}

/**
 * @param {Array<{ scoreChangeBySeat?: unknown }>} rounds
 * @returns {Record<number, number>}
 */
function sumScoreChangesBySeat(rounds) {
  const totals = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const r of rounds || []) {
    for (const seat of [0, 1, 2, 3]) {
      totals[seat] += seatScoreDelta(r.scoreChangeBySeat, seat);
    }
  }
  return totals;
}

/**
 * @param {Array<{ playerId: string, seat: number, matchTotalScore?: number }>} participants
 * @param {Array<{ scoreChangeBySeat?: unknown }>} rounds
 * @returns {Map<string, number>} playerId -> expected total
 */
function expectedTotalsByPlayerId(participants, rounds) {
  const seatTotals = sumScoreChangesBySeat(rounds);
  const out = new Map();
  for (const p of participants || []) {
    const seat = Number(p.seat);
    const total = Number.isFinite(seat) ? seatTotals[seat] ?? 0 : 0;
    out.set(p.playerId, total);
  }
  return out;
}

/**
 * @param {Array<{ playerId: string, seat: number, matchTotalScore?: number }>} participants
 * @param {Array<{ scoreChangeBySeat?: unknown }>} rounds
 * @returns {Array<{ playerId: string, seat: number, expected: number, current: number }>}
 */
function findParticipantScoreMismatches(participants, rounds) {
  const expected = expectedTotalsByPlayerId(participants, rounds);
  const mismatches = [];
  for (const p of participants || []) {
    const exp = expected.get(p.playerId) ?? 0;
    const cur = Number(p.matchTotalScore) || 0;
    if (exp !== cur) {
      mismatches.push({
        playerId: p.playerId,
        seat: p.seat,
        expected: exp,
        current: cur,
      });
    }
  }
  return mismatches;
}

/**
 * 回傳帶有 matchTotalScore（以 rounds 加總為準）的 players 列。
 * @param {Array<{ playerId: string, seat: number, matchTotalScore?: number, [key: string]: unknown }>} participants
 * @param {Array<{ scoreChangeBySeat?: unknown }>} rounds
 */
function participantsWithReconciledScores(participants, rounds) {
  const expected = expectedTotalsByPlayerId(participants, rounds);
  return (participants || []).map((p) => ({
    ...p,
    matchTotalScore: expected.get(p.playerId) ?? 0,
  }));
}

/**
 * 將 participant.matchTotalScore 寫回與 rounds 加總一致（僅更新有差異者）。
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} sessionId
 * @param {Array<{ playerId: string, seat: number, matchTotalScore?: number }>} participants
 * @param {Array<{ scoreChangeBySeat?: unknown }>} rounds
 */
async function reconcileParticipantScoresInTx(tx, sessionId, participants, rounds) {
  const mismatches = findParticipantScoreMismatches(participants, rounds);
  for (const m of mismatches) {
    await tx.v2MatchParticipant.update({
      where: {
        sessionId_playerId: {
          sessionId,
          playerId: m.playerId,
        },
      },
      data: { matchTotalScore: m.expected },
    });
  }
  return mismatches.length;
}

module.exports = {
  seatScoreDelta,
  sumScoreChangesBySeat,
  expectedTotalsByPlayerId,
  findParticipantScoreMismatches,
  participantsWithReconciledScores,
  reconcileParticipantScoresInTx,
};
