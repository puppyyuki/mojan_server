const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');
const { allocateShareCodeInTx } = require('../../utils/v2ReplayShareCode');
const { isV2RoundCompletedForStatistics } = require('../../utils/v2RoundStatistics');

function normalizeRounds(raw) {
  const n = Number(raw);
  return n === 2 || n === 4 ? n : 1;
}

function normalizeDeduction(raw) {
  const d = (raw || '').toString().toUpperCase();
  if (d === 'HOST_DEDUCTION' || d === 'CLUB_DEDUCTION') return d;
  return 'AA_DEDUCTION';
}

/**
 * 本桌房卡總消耗（與開局扣卡一致），再平均分攤到每位參與玩家（俱樂部排行／報表統計）。
 * AA：每人付 rounds 張 → 總計 rounds * 人數；俱樂部／房主扣卡：總計 rounds * 4，由四人分攤。
 */
function buildRoomCardConsumedByPlayerId(deduction, rounds, players) {
  const roomCardConsumedByPlayerId = new Map();
  if (!Array.isArray(players) || players.length === 0) {
    return { roomCardConsumedByPlayerId, roomCardConsumedTotal: 0 };
  }
  const sortedUniqueIds = [
    ...new Set(players.map((p) => p.playerId).filter(Boolean)),
  ].sort();
  const splitN = sortedUniqueIds.length;
  if (splitN <= 0) {
    return { roomCardConsumedByPlayerId, roomCardConsumedTotal: 0 };
  }
  const totalTableCardCost =
    deduction === 'AA_DEDUCTION' ? rounds * players.length : rounds * 4;
  const base = Math.floor(totalTableCardCost / splitN);
  let remainder = totalTableCardCost - base * splitN;
  for (const playerId of sortedUniqueIds) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    roomCardConsumedByPlayerId.set(playerId, base + extra);
  }
  return { roomCardConsumedByPlayerId, roomCardConsumedTotal: totalTableCardCost };
}

function normalizeScoresBySeat(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    0: Number(src[0] ?? src['0'] ?? 0) || 0,
    1: Number(src[1] ?? src['1'] ?? 0) || 0,
    2: Number(src[2] ?? src['2'] ?? 0) || 0,
    3: Number(src[3] ?? src['3'] ?? 0) || 0,
  };
}

function normalizeRoundsForDeduction(gameSettings) {
  const roundsRaw = Number(gameSettings?.rounds ?? 1);
  return roundsRaw === 2 || roundsRaw === 4 ? roundsRaw : 1;
}

function normalizeDeductionForRoom(gameSettings) {
  return gameSettings?.deduction || 'AA_DEDUCTION';
}

/**
 * v2 扣卡：改為「第一次中間結算（roundIndex=1）時」才扣卡，且同房只扣一次。
 */
async function applyV2FirstRoundDeductionInTx(tx, { room, playerIds }) {
  const rounds = normalizeRoundsForDeduction(room.gameSettings);
  const deduction = normalizeDeductionForRoom(room.gameSettings);
  const aaPerPlayer = rounds;
  const hostOrClubTotal = rounds * 4;
  const roomKey = room.roomId;
  const settings = room.gameSettings && typeof room.gameSettings === 'object'
    ? { ...room.gameSettings }
    : {};

  if (settings._v2FirstRoundDeducted === true) {
    return {
      alreadyDeducted: true,
      deduction,
      rounds,
      amount: deduction === 'AA_DEDUCTION' ? aaPerPlayer : hostOrClubTotal,
      players: [],
      club: null,
    };
  }

  const existing = await tx.cardConsumptionRecord.findFirst({
    where: {
      roomId: roomKey,
      reason: { startsWith: 'v2_first_round_' },
    },
    select: { id: true },
  });
  if (existing) {
    const nextSettings = {
      ...settings,
      _v2FirstRoundDeducted: true,
      _v2FirstRoundDeductedAt: settings._v2FirstRoundDeductedAt || new Date().toISOString(),
    };
    await tx.room.update({
      where: { id: room.id },
      data: { gameSettings: nextSettings },
    });
    return {
      alreadyDeducted: true,
      deduction,
      rounds,
      amount: deduction === 'AA_DEDUCTION' ? aaPerPlayer : hostOrClubTotal,
      players: [],
      club: null,
    };
  }

  if ((deduction === 'HOST_DEDUCTION' || deduction === 'CLUB_DEDUCTION') && room.clubId) {
    const club = await tx.club.findUnique({
      where: { id: room.clubId },
      select: { id: true, cardCount: true },
    });
    const balance = club?.cardCount ?? 0;
    if (!club || balance < hostOrClubTotal) {
      throw new Error(`俱樂部房卡不足（需要 ${hostOrClubTotal} 張，目前 ${balance} 張）`);
    }
    const updated = await tx.club.update({
      where: { id: room.clubId },
      data: { cardCount: { decrement: hostOrClubTotal } },
      select: { id: true, cardCount: true },
    });
    const nextSettings = {
      ...settings,
      _v2FirstRoundDeducted: true,
      _v2FirstRoundDeductedAt: new Date().toISOString(),
    };
    await tx.room.update({
      where: { id: room.id },
      data: { gameSettings: nextSettings },
    });
    return {
      alreadyDeducted: false,
      deduction,
      rounds,
      amount: hostOrClubTotal,
      players: [],
      club: updated,
    };
  }

  if (deduction === 'HOST_DEDUCTION') {
    if (!room.creatorId) {
      throw new Error('缺少房主資訊，無法執行房主扣卡');
    }
    const host = await tx.player.findUnique({
      where: { id: room.creatorId },
      select: { id: true, cardCount: true },
    });
    const balance = host?.cardCount ?? 0;
    if (!host || balance < hostOrClubTotal) {
      throw new Error(`房主房卡不足（需要 ${hostOrClubTotal} 張，目前 ${balance} 張）`);
    }
    const updated = await tx.player.update({
      where: { id: room.creatorId },
      data: { cardCount: { decrement: hostOrClubTotal } },
      select: { id: true, cardCount: true },
    });
    await tx.cardConsumptionRecord.create({
      data: {
        playerId: room.creatorId,
        roomId: roomKey,
        amount: hostOrClubTotal,
        reason: 'v2_first_round_host_deduction',
        previousCount: balance,
        newCount: updated.cardCount,
      },
    });
    const nextSettings = {
      ...settings,
      _v2FirstRoundDeducted: true,
      _v2FirstRoundDeductedAt: new Date().toISOString(),
    };
    await tx.room.update({
      where: { id: room.id },
      data: { gameSettings: nextSettings },
    });
    return {
      alreadyDeducted: false,
      deduction,
      rounds,
      amount: hostOrClubTotal,
      players: [updated],
      club: null,
    };
  }

  const uniquePlayerIds = [...new Set(playerIds.map((v) => v?.toString?.() || '').filter(Boolean))];
  if (uniquePlayerIds.length !== 4) {
    throw new Error('玩家ID資料異常，無法執行AA扣卡');
  }
  const dbPlayers = await tx.player.findMany({
    where: { id: { in: uniquePlayerIds } },
    select: { id: true, cardCount: true },
  });
  const byId = new Map(dbPlayers.map((p) => [p.id, p]));
  for (const pid of uniquePlayerIds) {
    const db = byId.get(pid);
    const balance = db?.cardCount ?? 0;
    if (!db || balance < aaPerPlayer) {
      throw new Error(`玩家 ${pid} 房卡不足（需要 ${aaPerPlayer} 張，目前 ${balance} 張）`);
    }
  }
  const updatedPlayers = [];
  for (const pid of uniquePlayerIds) {
    const before = byId.get(pid).cardCount;
    const updated = await tx.player.update({
      where: { id: pid },
      data: { cardCount: { decrement: aaPerPlayer } },
      select: { id: true, cardCount: true },
    });
    updatedPlayers.push(updated);
    await tx.cardConsumptionRecord.create({
      data: {
        playerId: pid,
        roomId: roomKey,
        amount: aaPerPlayer,
        reason: 'v2_first_round_aa_deduction',
        previousCount: before,
        newCount: updated.cardCount,
      },
    });
  }
  const nextSettings = {
    ...settings,
    _v2FirstRoundDeducted: true,
    _v2FirstRoundDeductedAt: new Date().toISOString(),
  };
  await tx.room.update({
    where: { id: room.id },
    data: { gameSettings: nextSettings },
  });
  return {
    alreadyDeducted: false,
    deduction,
    rounds,
    amount: aaPerPlayer,
    players: updatedPlayers,
    club: null,
  };
}

/**
 * POST /api/client/rooms
 * 在大廳建立房間（不關聯任何俱樂部）
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { maxPlayers, creatorId, gameSettings, multiplayerVersion } = req.body;

    if (!creatorId) {
      return errorResponse(res, '請提供創建者ID', null, 400);
    }

    const creator = await prisma.player.findUnique({
      where: { id: creatorId },
    });
    if (!creator) {
      return errorResponse(res, '創建者不存在', null, 404);
    }

    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({ where: { roomId: id } });
      return !exists;
    });

    const normalizedMultiplayerVersion =
      multiplayerVersion === 'v2' || multiplayerVersion === 'V2'
        ? 'V2'
        : 'V1';

    let finalGameSettings = gameSettings || {};
    if (gameSettings) {
      finalGameSettings = {
        base_points: gameSettings.base_points || 100,
        scoring_unit: gameSettings.scoring_unit || 20,
        rounds: gameSettings.rounds || 4,
        game_type: gameSettings.game_type || 'NORTHERN',
        special_rules:
          gameSettings.special_rules || {
            li_gu: false,
            eye_tile_feature: false,
            forced_win: false,
            no_points_dealer: false,
          },
        point_cap: gameSettings.point_cap || 'UP_TO_8_POINTS',
        deduction: gameSettings.deduction || 'AA_DEDUCTION',
        manual_start: gameSettings.manual_start || false,
        ip_check: gameSettings.ip_check || false,
        gps_lock: gameSettings.gps_lock || false,
      };
    }

    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: null,
        creatorId,
        currentPlayers: 0,
        maxPlayers: maxPlayers || 4,
        status: 'WAITING',
        multiplayerVersion: normalizedMultiplayerVersion,
        gameSettings: finalGameSettings,
      },
    });

    return successResponse(res, room, '房間創建成功');
  } catch (error) {
    console.error('[Rooms API] 大廳建立房間失敗:', error);
    return errorResponse(res, '建立房間失敗', error.message, 500);
  }
});

/**
 * POST /api/client/rooms/:roomId/deduct-on-start
 * 相容舊呼叫：v2 扣卡已改為第一次中間結算（roundIndex=1）時執行。
 */
router.post('/:roomId/deduct-on-start', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const { playerIds } = req.body || {};

    if (!roomId) {
      return errorResponse(res, '請提供房間ID', null, 400);
    }
    if (!Array.isArray(playerIds) || playerIds.length !== 4) {
      return errorResponse(res, '請提供4位玩家ID', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { roomId: true, creatorId: true, clubId: true, gameSettings: true },
    });
    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    const rounds = normalizeRoundsForDeduction(room.gameSettings);
    const deduction = normalizeDeductionForRoom(room.gameSettings);
    const amount = deduction === 'AA_DEDUCTION' ? rounds : rounds * 4;
    const existing = await prisma.cardConsumptionRecord.findFirst({
      where: {
        roomId: room.roomId,
        reason: { startsWith: 'v2_first_round_' },
      },
      select: { id: true },
    });
    return successResponse(
      res,
      {
        pendingDeduction: true,
        alreadyDeducted: !!existing,
        deduction,
        rounds,
        amount,
      },
      existing ? '本房已完成首次中間結算扣卡' : '已改為首次中間結算扣卡，開局不扣卡'
    );
  } catch (error) {
    console.error('[Rooms API] v2 扣卡狀態查詢失敗:', error);
    return errorResponse(res, error?.message || '扣卡狀態查詢失敗', null, 400);
  }
});

/**
 * GET /api/client/rooms/:roomId
 * 獲取房間資訊
 */
router.get('/:roomId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const viewerPlayerId =
      typeof req.query?.playerId === 'string' && req.query.playerId.trim()
        ? req.query.playerId.trim()
        : null;
    let viewerPlayer = null;
    if (viewerPlayerId) {
      viewerPlayer = await prisma.player.findUnique({
        where: { id: viewerPlayerId },
        select: { id: true, userId: true },
      });
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        roomId: true,
        clubId: true,
        creatorId: true,
        currentPlayers: true,
        maxPlayers: true,
        status: true,
        multiplayerVersion: true,
        gameSettings: true,
        createdAt: true,
      },
    });

    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    let access = {
      isClubRoom: !!room.clubId,
      isClubMember: false,
      isBanned: false,
      canJoinViaLobby: room.clubId ? false : true,
      canJoinViaClub: room.clubId ? false : true,
    };

    if (room.clubId && viewerPlayerId) {
      const member = await prisma.clubMember.findUnique({
        where: {
          clubId_playerId: {
            clubId: room.clubId,
            playerId: viewerPlayerId,
          },
        },
        select: { isBanned: true },
      });
      const isClubMember = !!member;
      const isBanned = member?.isBanned === true;
      access = {
        isClubRoom: true,
        isClubMember,
        isBanned,
        canJoinViaLobby: false,
        canJoinViaClub: isClubMember && !isBanned,
      };
    }

    return successResponse(
      res,
      {
        ...room,
        access,
        viewer: viewerPlayer
          ? {
              playerId: viewerPlayer.id,
              userId: viewerPlayer.userId ?? null,
            }
          : null,
      },
      '獲取房間資訊成功'
    );
  } catch (error) {
    console.error('[Rooms API] 獲取房間資訊失敗:', error);
    return errorResponse(res, '獲取房間資訊失敗', error.message, 500);
  }
});

/**
 * DELETE /api/client/rooms/:roomId
 * 由即時伺服器或系統清除房間紀錄
 */
router.delete('/:roomId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;

    if (!roomId) {
      return errorResponse(res, '請提供房間ID', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true, clubId: true, creatorId: true, gameSettings: true },
    });

    if (!room) {
      // 清除流程採冪等，不把「不存在」視為錯誤
      return successResponse(res, { roomId, deleted: false }, '房間已不存在');
    }

    await prisma.room.delete({
      where: { roomId },
    });

    return successResponse(res, { roomId, deleted: true }, '房間刪除成功');
  } catch (error) {
    console.error('[Rooms API] 刪除房間失敗:', error);
    return errorResponse(res, '刪除房間失敗', error.message, 500);
  }
});

/**
 * POST /api/client/rooms/:roomId/participants/join
 * v2/即時伺服器同步：玩家加入房間（寫入 room_participants + currentPlayers）
 */
router.post('/:roomId/participants/join', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const playerId = req.body?.playerId?.toString?.();

    if (!roomId || !playerId) {
      return errorResponse(res, '請提供 roomId 與 playerId', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true },
    });
    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    await prisma.roomParticipant.upsert({
      where: {
        roomId_playerId: {
          roomId: room.id,
          playerId,
        },
      },
      update: { leftAt: null },
      create: {
        roomId: room.id,
        playerId,
        leftAt: null,
      },
    });

    const activeCount = await prisma.roomParticipant.count({
      where: { roomId: room.id, leftAt: null },
    });

    const roomRow = await prisma.room.updateMany({
      where: { id: room.id },
      data: { currentPlayers: activeCount },
    });
    if (roomRow.count === 0) {
      return successResponse(
        res,
        { roomId: room.roomId, playerId, currentPlayers: activeCount },
        '房間紀錄已移除，略過人數同步'
      );
    }

    return successResponse(
      res,
      { roomId: room.roomId, playerId, currentPlayers: activeCount },
      '玩家入房同步成功'
    );
  } catch (error) {
    console.error('[Rooms API] 同步玩家加入失敗:', error);
    return errorResponse(res, '同步玩家加入失敗', error.message, 500);
  }
});

/**
 * POST /api/client/rooms/:roomId/participants/leave
 * v2/即時伺服器同步：玩家離開房間（更新 leftAt + currentPlayers）
 */
router.post('/:roomId/participants/leave', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const playerId = req.body?.playerId?.toString?.();

    if (!roomId || !playerId) {
      return errorResponse(res, '請提供 roomId 與 playerId', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true },
    });
    if (!room) {
      return successResponse(
        res,
        { roomId, playerId, currentPlayers: 0 },
        '房間已不存在，略過離房同步'
      );
    }

    await prisma.roomParticipant.updateMany({
      where: {
        roomId: room.id,
        playerId,
        leftAt: null,
      },
      data: { leftAt: new Date() },
    });

    const activeCount = await prisma.roomParticipant.count({
      where: { roomId: room.id, leftAt: null },
    });

    // 解散時可能已先刪除 Room，與離房同步並行會造成 prisma.room.update P2025；updateMany 不會拋錯
    const roomRow = await prisma.room.updateMany({
      where: { id: room.id },
      data: { currentPlayers: activeCount },
    });
    if (roomRow.count === 0) {
      return successResponse(
        res,
        { roomId: room.roomId, playerId, currentPlayers: activeCount },
        '房間紀錄已移除，略過人數同步'
      );
    }

    return successResponse(
      res,
      { roomId: room.roomId, playerId, currentPlayers: activeCount },
      '玩家離房同步成功'
    );
  } catch (error) {
    console.error('[Rooms API] 同步玩家離開失敗:', error);
    return errorResponse(res, '同步玩家離開失敗', error.message, 500);
  }
});

/**
 * POST /api/client/rooms/:roomId/final-settlement
 * v2 最終結算落庫（俱樂部排行/戰績統計）
 */
router.post('/:roomId/final-settlement', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const body = req.body || {};

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        clubId: true,
        creatorId: true,
        gameSettings: true,
        status: true,
      },
    });
    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    const scoresBySeat = normalizeScoresBySeat(body.scoresBySeat);
    const sourcePlayers = Array.isArray(body.players) ? body.players : [];
    const rounds = normalizeRounds(body.totalRounds ?? room.gameSettings?.rounds);
    const deduction = normalizeDeduction(body.deduction ?? room.gameSettings?.deduction);
    const now = new Date();

    const players = sourcePlayers
      .map((p) => {
        const playerId = p?.playerId?.toString?.() ?? '';
        const seatNum = Number(p?.seat);
        const seat = Number.isInteger(seatNum) ? seatNum : null;
        const score =
          seat != null
            ? Number(scoresBySeat[seat] ?? 0) || 0
            : Number(p?.score ?? 0) || 0;
        return {
          playerId,
          userId: p?.userId?.toString?.() ?? null,
          nickname: p?.nickname?.toString?.() ?? '',
          avatarUrl: p?.avatarUrl?.toString?.() ?? null,
          seat,
          score,
          statistics: {
            selfDraws: Number(p?.statistics?.selfDraws ?? 0) || 0,
            claimedDiscards: Number(p?.statistics?.claimedDiscards ?? 0) || 0,
            discardedHu: Number(p?.statistics?.discardedHu ?? 0) || 0,
          },
        };
      })
      .filter((p) => !!p.playerId);

    const highestScore = players.length > 0
      ? Math.max(...players.map((p) => p.score))
      : 0;
    const bigWinnerPlayerIds = players
      .filter((p) => p.score === highestScore)
      .map((p) => p.playerId);

    const { roomCardConsumedByPlayerId, roomCardConsumedTotal } =
      buildRoomCardConsumedByPlayerId(deduction, rounds, players);

    const persisted = await prisma.$transaction(async (tx) => {
      const existing = await tx.clubGameResult.findUnique({
        where: { roomId: room.roomId },
        select: { id: true },
      });
      if (existing) {
        await tx.room.update({
          where: { id: room.id },
          data: { status: 'FINISHED' },
        });
        return { alreadySaved: true, skipped: false };
      }

      if (!room.clubId) {
        await tx.room.update({
          where: { id: room.id },
          data: { status: 'FINISHED' },
        });
        return { alreadySaved: false, skipped: true };
      }

      const playersWithRanking = [...players]
        .sort((a, b) => b.score - a.score)
        .map((p, idx) => ({
          ...p,
          rank: idx + 1,
          isBigWinner: bigWinnerPlayerIds.includes(p.playerId),
          roomCardConsumed: Number(roomCardConsumedByPlayerId.get(p.playerId) ?? 0) || 0,
        }));

      await tx.clubGameResult.create({
        data: {
          clubId: room.clubId,
          roomId: room.roomId,
          roomInternalId: room.id,
          multiplayerVersion: 'V2',
          totalRounds: rounds,
          deduction,
          roomCardConsumedTotal,
          bigWinnerPlayerIds,
          scoresBySeat,
          players: playersWithRanking,
          endedAt: now,
        },
      });

      for (const p of playersWithRanking) {
        const increments = {
          clubScore: { increment: p.score },
          bigWinnerCount: { increment: p.isBigWinner ? 1 : 0 },
          roomCardConsumed: { increment: p.roomCardConsumed },
          lastGameTime: now,
        };
        if (p.playerId === room.creatorId) {
          increments.hostCount = { increment: 1 };
        }
        await tx.clubMember.updateMany({
          where: {
            clubId: room.clubId,
            playerId: p.playerId,
          },
          data: increments,
        });
      }

      await tx.room.update({
        where: { id: room.id },
        data: { status: 'FINISHED' },
      });

      return { alreadySaved: false, skipped: false };
    });

    return successResponse(
      res,
      {
        roomId: room.roomId,
        clubId: room.clubId,
        rounds,
        deduction,
        roomCardConsumedTotal,
        alreadySaved: persisted.alreadySaved,
        skipped: persisted.skipped,
      },
      persisted.alreadySaved
        ? '最終結算已落庫，略過重複寫入'
        : persisted.skipped
        ? '非俱樂部房間，已標記結束'
        : '最終結算寫入成功'
    );
  } catch (error) {
    console.error('[Rooms API] v2 最終結算落庫失敗:', error);
    return errorResponse(res, '最終結算落庫失敗', error.message, 500);
  }
});

function v2HistoryWriteAllowed(req) {
  const secret = process.env.V2_HISTORY_SECRET;
  if (!secret || !String(secret).trim()) return true;
  return req.get('x-v2-history-secret') === String(secret);
}

/**
 * POST /api/client/rooms/:roomId/v2/session/start
 * v2 遊戲開始時建立戰績 session（由 colyseus 呼叫）
 */
router.post('/:roomId/v2/session/start', async (req, res) => {
  try {
    if (!v2HistoryWriteAllowed(req)) {
      return errorResponse(res, '未授權寫入戰績', null, 403);
    }
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const body = req.body || {};
    const hostPlayerId = (body.hostPlayerId || '').toString();
    const players = Array.isArray(body.players) ? body.players : [];
    const gameSettings = body.gameSettings ?? null;

    if (!hostPlayerId || players.length !== 4) {
      return errorResponse(res, '請提供 hostPlayerId 與四位玩家', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true, clubId: true },
    });
    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    const session = await prisma.v2MatchSession.create({
      data: {
        roomCode: room.roomId,
        roomInternalId: room.id,
        clubId: room.clubId,
        hostPlayerId,
        multiplayerVersion: 'V2',
        gameSettings,
        status: 'IN_PROGRESS',
        participants: {
          create: players
            .map((p) => ({
              playerId: p.playerId?.toString() || '',
              seat: Number(p.seat) || 0,
              isHost: !!p.isHost,
              nickname: (p.nickname || '').toString(),
              userId: p.userId?.toString() || null,
              avatarUrl: p.avatarUrl?.toString() || null,
              matchTotalScore: 0,
            }))
            .filter((p) => p.playerId.length > 0),
        },
      },
    });

    return successResponse(res, { sessionId: session.id }, 'v2 session 已建立');
  } catch (error) {
    console.error('[Rooms API] v2 session/start 失敗:', error);
    return errorResponse(res, '建立戰績 session 失敗', error.message, 500);
  }
});

/**
 * POST /api/client/rooms/:roomId/v2/round
 * 每局結束後寫入事件與分數（胡牌、自摸或流局皆算一局；非阻塞由呼叫端處理）
 */
router.post('/:roomId/v2/round', async (req, res) => {
  try {
    if (!v2HistoryWriteAllowed(req)) {
      return errorResponse(res, '未授權寫入戰績', null, 403);
    }
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const body = req.body || {};
    const sessionId = (body.sessionId || '').toString();
    const roundIndex = Number(body.roundIndex);
    const events = body.events;
    const scoreChangeBySeat = normalizeScoresBySeat(body.scoreChangeBySeat);
    const roundEndPayload = body.roundEndPayload ?? null;

    if (!sessionId || !Number.isInteger(roundIndex) || roundIndex < 1) {
      return errorResponse(res, '請提供 sessionId 與 roundIndex', null, 400);
    }
    if (!Array.isArray(events)) {
      return errorResponse(res, '請提供 events 陣列', null, 400);
    }

    const session = await prisma.v2MatchSession.findUnique({
      where: { id: sessionId },
      select: { id: true, roomCode: true, hostPlayerId: true, status: true, clubId: true },
    });
    if (!session || session.roomCode !== roomId) {
      return errorResponse(res, 'session 與房號不符', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        id: true,
        roomId: true,
        creatorId: true,
        clubId: true,
        gameSettings: true,
      },
    });

    let persistedRoundId = null;
    let firstRoundDeduction = null;
    await prisma.$transaction(async (tx) => {
      const existingRound = await tx.v2MatchRound.findUnique({
        where: {
          sessionId_roundIndex: { sessionId, roundIndex },
        },
        select: { id: true, roundEndPayload: true },
      });

      const clubIdForStats = session.clubId ?? room?.clubId ?? null;
      const roundEndedAt = new Date();
      const completedNow = isV2RoundCompletedForStatistics(roundEndPayload);
      const wasStatsCounted = isV2RoundCompletedForStatistics(
        existingRound?.roundEndPayload ?? null
      );

      const bumpClubTotalGamesIfNeeded = async (participantRows) => {
        if (!clubIdForStats || !completedNow || wasStatsCounted) return;
        for (const p of participantRows) {
          await tx.clubMember.updateMany({
            where: { clubId: clubIdForStats, playerId: p.playerId },
            data: {
              totalGames: { increment: 1 },
              lastGameTime: roundEndedAt,
            },
          });
        }
      };

      if (existingRound) {
        await tx.v2MatchRound.update({
          where: { id: existingRound.id },
          data: {
            scoreChangeBySeat,
            roundEndPayload,
            eventsJson: events,
            endedAt: roundEndedAt,
          },
        });
        persistedRoundId = existingRound.id;
        const partsAfterUpdate = await tx.v2MatchParticipant.findMany({
          where: { sessionId },
        });
        await bumpClubTotalGamesIfNeeded(partsAfterUpdate);
      } else {
        const parts = await tx.v2MatchParticipant.findMany({
          where: { sessionId },
        });
        if (roundIndex === 1 && room) {
          try {
            firstRoundDeduction = await applyV2FirstRoundDeductionInTx(tx, {
              room,
              playerIds: parts.map((p) => p.playerId),
            });
          } catch (deductError) {
            // 扣卡失敗不應阻斷第一局戰績落庫，避免後續局序從 02 開始造成 01 缺失。
            const message =
              deductError && typeof deductError.message === 'string'
                ? deductError.message
                : '首次中間結算扣卡失敗';
            firstRoundDeduction = {
              failed: true,
              message,
            };
            console.error(
              '[Rooms API] v2 first round deduction failed (round persisted):',
              {
                roomId: room.roomId,
                sessionId,
                roundIndex,
                message,
              }
            );
          }
        } else if (roundIndex === 1 && !room) {
          firstRoundDeduction = {
            failed: true,
            message: '房間資料不存在，略過首次扣卡；局戰績已寫入',
          };
          console.warn('[Rooms API] v2 round first deduction skipped: room missing', {
            roomId,
            sessionId,
            roundIndex,
          });
        }
        const created = await tx.v2MatchRound.create({
          data: {
            sessionId,
            roundIndex,
            scoreChangeBySeat,
            roundEndPayload,
            eventsJson: events,
          },
        });
        persistedRoundId = created.id;

        for (const p of parts) {
          const delta = Number(scoreChangeBySeat[p.seat] ?? 0) || 0;
          if (delta === 0) continue;
          await tx.v2MatchParticipant.update({
            where: {
              sessionId_playerId: {
                sessionId,
                playerId: p.playerId,
              },
            },
            data: { matchTotalScore: { increment: delta } },
          });
        }

        await bumpClubTotalGamesIfNeeded(parts);
      }
    });

    if (persistedRoundId) {
      try {
        await prisma.$transaction(async (tx) => {
          await allocateShareCodeInTx(
            tx,
            persistedRoundId,
            session.hostPlayerId
          );
        });
      } catch (e) {
        console.error(
          '[Rooms API] v2 round 自動產生重播分享碼失敗:',
          persistedRoundId,
          e.message
        );
      }
    }

    return successResponse(
      res,
      { sessionId, roundIndex, firstRoundDeduction },
      '局資料已寫入'
    );
  } catch (error) {
    console.error('[Rooms API] v2 round 失敗:', error);
    return errorResponse(res, '寫入局戰績失敗', error.message, 500);
  }
});

/**
 * PATCH /api/client/rooms/:roomId/v2/session/status
 * 標記 session 結束或解散
 */
router.patch('/:roomId/v2/session/status', async (req, res) => {
  try {
    if (!v2HistoryWriteAllowed(req)) {
      return errorResponse(res, '未授權寫入戰績', null, 403);
    }
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const body = req.body || {};
    const sessionId = (body.sessionId || '').toString();
    const status = (body.status || '').toString().toUpperCase();

    if (!sessionId || !['FINISHED', 'DISBANDED'].includes(status)) {
      return errorResponse(res, '請提供 sessionId 與 status', null, 400);
    }

    const session = await prisma.v2MatchSession.findUnique({
      where: { id: sessionId },
      select: { roomCode: true },
    });
    if (!session || session.roomCode !== roomId) {
      return errorResponse(res, 'session 與房號不符', null, 400);
    }

    await prisma.v2MatchSession.update({
      where: { id: sessionId },
      data: {
        status,
        endedAt: new Date(),
      },
    });

    return successResponse(res, { sessionId, status }, 'session 狀態已更新');
  } catch (error) {
    console.error('[Rooms API] v2 session/status 失敗:', error);
    return errorResponse(res, '更新 session 失敗', error.message, 500);
  }
});

/**
 * PATCH /api/client/rooms/:roomId/v2/room/status
 * 同步 Room 狀態（WAITING / PLAYING / FINISHED）
 */
router.patch('/:roomId/v2/room/status', async (req, res) => {
  try {
    if (!v2HistoryWriteAllowed(req)) {
      return errorResponse(res, '未授權寫入戰績', null, 403);
    }
    const { prisma } = req.app.locals;
    const { roomId } = req.params;
    const body = req.body || {};
    const status = (body.status || '').toString().toUpperCase();

    if (!['WAITING', 'PLAYING', 'FINISHED'].includes(status)) {
      return errorResponse(res, '請提供有效 room status', null, 400);
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true },
    });
    if (!room) {
      return errorResponse(res, '房間不存在', null, 404);
    }

    await prisma.room.update({
      where: { id: room.id },
      data: { status },
    });

    return successResponse(res, { roomId: room.roomId, status }, 'room 狀態已更新');
  } catch (error) {
    console.error('[Rooms API] v2 room/status 失敗:', error);
    return errorResponse(res, '更新 room 狀態失敗', error.message, 500);
  }
});

module.exports = router;
