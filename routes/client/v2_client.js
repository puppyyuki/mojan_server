const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * GET /api/client/v2/matches/:sessionId
 * 戰績詳情：各局列表與分數
 * Query: actorPlayerId（須為該場參與者）
 */
router.get('/matches/:sessionId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { sessionId } = req.params;
    const actorPlayerId = (req.query.actorPlayerId || '').toString();

    if (!actorPlayerId) {
      return errorResponse(res, '請提供 actorPlayerId', null, 400);
    }

    const membership = await prisma.v2MatchParticipant.findFirst({
      where: { sessionId, playerId: actorPlayerId },
    });
    if (!membership) {
      return errorResponse(res, '無權查看此戰績', null, 403);
    }

    const session = await prisma.v2MatchSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
        },
        rounds: {
          orderBy: { roundIndex: 'asc' },
        },
      },
    });

    if (!session) {
      return errorResponse(res, '戰績不存在', null, 404);
    }

    const gameType = session.gameSettings?.game_type || 'NORTHERN';
    const gameLabel = gameType === 'NORTHERN' ? '北部麻將' : String(gameType);

    return successResponse(res, {
      sessionId: session.id,
      roomCode: session.roomCode,
      clubId: session.clubId,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      gameSettings: session.gameSettings,
      gameTypeLabel: gameLabel,
      hostPlayerId: session.hostPlayerId,
      players: session.participants.map((p) => ({
        playerId: p.playerId,
        userId: p.userId ?? p.player?.userId,
        nickname: p.nickname || p.player?.nickname || '',
        avatarUrl: p.avatarUrl ?? p.player?.avatarUrl,
        seat: p.seat,
        isHost: p.isHost,
        matchTotalScore: p.matchTotalScore,
      })),
      rounds: session.rounds.map((r) => ({
        roundId: r.id,
        roundIndex: r.roundIndex,
        endedAt: r.endedAt,
        scoreChangeBySeat: r.scoreChangeBySeat,
      })),
    });
  } catch (error) {
    console.error('[V2 Client API] 戰績詳情失敗:', error);
    return errorResponse(res, '獲取戰績詳情失敗', error.message, 500);
  }
});

/**
 * GET /api/client/v2/rounds/:roundId/replay
 * 單局重播事件流
 * Query: viewerPlayerId（須為該場參與者）
 */
router.get('/rounds/:roundId/replay', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roundId } = req.params;
    const viewerPlayerId = (req.query.viewerPlayerId || '').toString();

    if (!viewerPlayerId) {
      return errorResponse(res, '請提供 viewerPlayerId', null, 400);
    }

    const round = await prisma.v2MatchRound.findUnique({
      where: { id: roundId },
      include: {
        session: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!round) {
      return errorResponse(res, '局資料不存在', null, 404);
    }

    const ok = round.session.participants.some(
      (p) => p.playerId === viewerPlayerId
    );
    if (!ok) {
      return errorResponse(res, '無權查看此重播', null, 403);
    }

    const viewer = round.session.participants.find(
      (p) => p.playerId === viewerPlayerId
    );

    return successResponse(res, {
      roundId: round.id,
      sessionId: round.sessionId,
      roundIndex: round.roundIndex,
      roomCode: round.session.roomCode,
      viewerPlayerId,
      viewerSeat: viewer?.seat ?? 0,
      events: round.eventsJson,
      roundEndPayload: round.roundEndPayload,
    });
  } catch (error) {
    console.error('[V2 Client API] 重播資料失敗:', error);
    return errorResponse(res, '獲取重播資料失敗', error.message, 500);
  }
});

module.exports = router;
