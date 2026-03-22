const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

/** 前 9 碼：0–9 各數字至多出現一次（隨機洗牌取前 9 個） */
function buildNineNonRepeatingDigits() {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, 9).join('');
}

/** 後 2 碼：局序，01–99 */
function roundIndexSuffix(roundIndex) {
  const n = Number(roundIndex);
  const clamped = Number.isFinite(n)
    ? Math.min(99, Math.max(1, Math.floor(n)))
    : 1;
  return String(clamped).padStart(2, '0');
}

function buildShareCodeForRound(roundIndex) {
  return `${buildNineNonRepeatingDigits()}${roundIndexSuffix(roundIndex)}`;
}

function normalizeShareCodeInput(raw) {
  const s = String(raw || '').replace(/\D/g, '');
  return s.length === 11 ? s : null;
}

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
        shareCode: r.shareCode,
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

/**
 * POST /api/client/v2/rounds/:roundId/share-code
 * 參與者取得／建立本局 11 碼重播分享碼（寫入資料庫，重複請求回傳既有碼）
 * Body: { actorPlayerId }
 */
router.post('/rounds/:roundId/share-code', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roundId } = req.params;
    const actorPlayerId = (req.body?.actorPlayerId || '').toString();

    if (!actorPlayerId) {
      return errorResponse(res, '請提供 actorPlayerId', null, 400);
    }

    const round = await prisma.v2MatchRound.findUnique({
      where: { id: roundId },
      include: {
        session: {
          include: { participants: true },
        },
      },
    });

    if (!round) {
      return errorResponse(res, '局資料不存在', null, 404);
    }

    const ok = round.session.participants.some(
      (p) => p.playerId === actorPlayerId
    );
    if (!ok) {
      return errorResponse(res, '無權分享此局重播', null, 403);
    }

    if (round.shareCode) {
      // 每次按分享都更新：重播視角一律跟「最後分享的人」（與補寫舊資料缺欄位）
      await prisma.v2MatchRound.update({
        where: { id: roundId },
        data: { shareCodeAllocatedByPlayerId: actorPlayerId },
      });
      return successResponse(res, {
        shareCode: round.shareCode,
        roundId: round.id,
        sessionId: round.sessionId,
        roundIndex: round.roundIndex,
      });
    }

    const allocated = await prisma.$transaction(async (tx) => {
      let current = await tx.v2MatchRound.findUnique({ where: { id: roundId } });
      if (!current) {
        throw new Error('局資料不存在');
      }
      if (current.shareCode) {
        return current.shareCode;
      }

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const candidate = buildShareCodeForRound(current.roundIndex);
        try {
          const upd = await tx.v2MatchRound.updateMany({
            where: { id: roundId, shareCode: null },
            data: {
              shareCode: candidate,
              shareCodeAllocatedByPlayerId: actorPlayerId,
            },
          });
          if (upd.count === 1) {
            return candidate;
          }
          current = await tx.v2MatchRound.findUnique({ where: { id: roundId } });
          if (current?.shareCode) {
            return current.shareCode;
          }
        } catch (e) {
          if (e.code === 'P2002') {
            continue;
          }
          throw e;
        }
      }
      throw new Error('無法產生唯一重播碼，請稍後再試');
    });

    return successResponse(res, {
      shareCode: allocated,
      roundId: round.id,
      sessionId: round.sessionId,
      roundIndex: round.roundIndex,
    });
  } catch (error) {
    console.error('[V2 Client API] 產生重播分享碼失敗:', error);
    return errorResponse(res, '產生重播分享碼失敗', error.message, 500);
  }
});

/**
 * GET /api/client/v2/replay-by-share-code
 * 以 11 碼分享碼載入重播（不需為該場參與者）
 * Query: shareCode, viewerPlayerId（須為有效玩家 id）
 */
router.get('/replay-by-share-code', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const shareCode = normalizeShareCodeInput(req.query.shareCode);
    const viewerPlayerId = (req.query.viewerPlayerId || '').toString();

    if (!shareCode) {
      return errorResponse(res, '請提供 11 碼數字重播碼', null, 400);
    }
    if (!viewerPlayerId) {
      return errorResponse(res, '請提供 viewerPlayerId', null, 400);
    }

    const viewer = await prisma.player.findUnique({
      where: { id: viewerPlayerId },
      select: { id: true },
    });
    if (!viewer) {
      return errorResponse(res, '觀看者玩家不存在', null, 400);
    }

    const round = await prisma.v2MatchRound.findUnique({
      where: { shareCode },
      include: {
        session: {
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
          },
        },
      },
    });

    if (!round) {
      return errorResponse(res, '找不到此重播碼或尚未開放分享', null, 404);
    }

    const session = round.session;
    const gameType = session.gameSettings?.game_type || 'NORTHERN';
    const gameLabel = gameType === 'NORTHERN' ? '北部麻將' : String(gameType);

    const sharerId = round.shareCodeAllocatedByPlayerId;
    const sharerPart = sharerId
      ? session.participants.find((p) => p.playerId === sharerId)
      : null;
    // 透過分享碼觀看：一律以產生分享碼者之座位為「自家」視角（與觀看者是否為該場玩家無關）
    const viewerSeat =
      sharerPart != null
        ? sharerPart.seat
        : session.participants.find((p) => p.playerId === viewerPlayerId)?.seat ??
          0;

    const players = session.participants.map((p) => ({
      playerId: p.playerId,
      userId: p.userId ?? p.player?.userId,
      nickname: p.nickname || p.player?.nickname || '',
      avatarUrl: p.avatarUrl ?? p.player?.avatarUrl,
      seat: p.seat,
      isHost: p.isHost,
      matchTotalScore: p.matchTotalScore,
    }));

    return successResponse(res, {
      roundId: round.id,
      sessionId: session.id,
      roundIndex: round.roundIndex,
      roomCode: session.roomCode,
      viewerPlayerId,
      // 與 viewerSeat 對齊：privateStatesBundle 必須用此 playerId 解包，否則畫面座位與手牌來源會錯位
      replayAsPlayerId: sharerId || null,
      viewerSeat,
      events: round.eventsJson,
      roundEndPayload: round.roundEndPayload,
      gameSettings: session.gameSettings,
      gameTypeLabel: gameLabel,
      hostPlayerId: session.hostPlayerId,
      startedAt: session.startedAt,
      players,
    });
  } catch (error) {
    console.error('[V2 Client API] 分享碼重播失敗:', error);
    return errorResponse(res, '取得分享重播失敗', error.message, 500);
  }
});

module.exports = router;
