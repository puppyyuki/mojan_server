const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const {
  normalizeShareCodeInput,
  allocateShareCodeInTx,
} = require('../../utils/v2ReplayShareCode');
const {
  mayReadClubV2MatchAsNonParticipant,
} = require('../../utils/clubV2HistoryAccess');

/** 俱樂部房戰績／重播：6 碼顯示用 ID + 頭像（V2MatchSession.clubId 為 Club 主鍵） */
async function v2ClubSettlementMeta(prisma, sessionClubInternalId) {
  if (!sessionClubInternalId) {
    return { clubDisplayCode: null, clubAvatarUrl: null };
  }
  const club = await prisma.club.findUnique({
    where: { id: sessionClubInternalId },
    select: { clubId: true, avatarUrl: true },
  });
  if (!club) {
    return { clubDisplayCode: null, clubAvatarUrl: null };
  }
  return {
    clubDisplayCode: club.clubId,
    clubAvatarUrl: club.avatarUrl ?? null,
  };
}

/** 已由 Prisma 載入之 Club 列（含顯示用 clubId 欄位），避免再查一次 */
function v2ClubSettlementMetaFromRow(clubRow) {
  if (!clubRow) {
    return { clubDisplayCode: null, clubAvatarUrl: null };
  }
  return {
    clubDisplayCode: clubRow.clubId ?? null,
    clubAvatarUrl: clubRow.avatarUrl ?? null,
  };
}

/**
 * GET /api/client/v2/matches/:sessionId
 * 戰績詳情：各局列表與分數
 * Query: actorPlayerId（參與者；或俱樂部擁有者／副會長／公關可讀同俱樂部非己參與場次）
 */
router.get('/matches/:sessionId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { sessionId } = req.params;
    const actorPlayerId = (req.query.actorPlayerId || '').toString();

    if (!actorPlayerId) {
      return errorResponse(res, '請提供 actorPlayerId', null, 400);
    }

    // 先只做可見性判斷（不含暱稱等 PII），通過後再載入完整局次
    const gate = await prisma.v2MatchSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        clubId: true,
        participants: { select: { playerId: true } },
      },
    });

    if (!gate) {
      return errorResponse(res, '戰績不存在', null, 404);
    }

    const isSessionParticipant = gate.participants.some(
      (p) => p.playerId === actorPlayerId
    );

    let clubRow = null;
    if (gate.clubId) {
      clubRow = await prisma.club.findUnique({
        where: { id: gate.clubId },
        select: { id: true, creatorId: true, clubId: true, avatarUrl: true },
      });
    }

    const allowed = await mayReadClubV2MatchAsNonParticipant(
      prisma,
      gate.clubId,
      actorPlayerId,
      isSessionParticipant,
      clubRow && clubRow.id
        ? { id: clubRow.id, creatorId: clubRow.creatorId }
        : null
    );
    if (!allowed) {
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

    const clubMeta = v2ClubSettlementMetaFromRow(clubRow);

    return successResponse(res, {
      sessionId: session.id,
      roomCode: session.roomCode,
      clubId: session.clubId,
      clubDisplayCode: clubMeta.clubDisplayCode,
      clubAvatarUrl: clubMeta.clubAvatarUrl,
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
 * Query: viewerPlayerId（參與者；或俱樂部擁有者／副會長／公關可讀同俱樂部場次）
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

    const isParticipant = round.session.participants.some(
      (p) => p.playerId === viewerPlayerId
    );
    let clubRow = null;
    if (round.session.clubId) {
      clubRow = await prisma.club.findUnique({
        where: { id: round.session.clubId },
        select: { id: true, creatorId: true, clubId: true, avatarUrl: true },
      });
    }

    const ok = await mayReadClubV2MatchAsNonParticipant(
      prisma,
      round.session.clubId,
      viewerPlayerId,
      isParticipant,
      clubRow && clubRow.id
        ? { id: clubRow.id, creatorId: clubRow.creatorId }
        : null
    );
    if (!ok) {
      return errorResponse(res, '無權查看此重播', null, 403);
    }

    const viewer = round.session.participants.find(
      (p) => p.playerId === viewerPlayerId
    ); // 非參與者時為 undefined，改以房主視角播事件
    let viewerSeat = 0;
    let replayAsPlayerId = viewerPlayerId;
    if (viewer) {
      viewerSeat = viewer.seat;
      replayAsPlayerId = viewer.playerId;
    } else {
      const parts = [...(round.session.participants || [])].sort(
        (a, b) => a.seat - b.seat
      );
      const hostId = round.session.hostPlayerId;
      const pick =
        parts.find((p) => p.playerId === hostId) || parts[0] || null;
      if (pick) {
        viewerSeat = pick.seat;
        replayAsPlayerId = pick.playerId;
      }
    }

    const clubMeta = v2ClubSettlementMetaFromRow(clubRow);

    return successResponse(res, {
      roundId: round.id,
      sessionId: round.sessionId,
      roundIndex: round.roundIndex,
      roomCode: round.session.roomCode,
      viewerPlayerId,
      replayAsPlayerId,
      viewerSeat,
      events: round.eventsJson,
      roundEndPayload: round.roundEndPayload,
      clubId: round.session.clubId,
      clubDisplayCode: clubMeta.clubDisplayCode,
      clubAvatarUrl: clubMeta.clubAvatarUrl,
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

    const allocated = await prisma.$transaction(async (tx) =>
      allocateShareCodeInTx(tx, roundId, actorPlayerId)
    );

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

    const clubMeta = await v2ClubSettlementMeta(prisma, session.clubId);

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
      clubId: session.clubId,
      clubDisplayCode: clubMeta.clubDisplayCode,
      clubAvatarUrl: clubMeta.clubAvatarUrl,
    });
  } catch (error) {
    console.error('[V2 Client API] 分享碼重播失敗:', error);
    return errorResponse(res, '取得分享重播失敗', error.message, 500);
  }
});

module.exports = router;
