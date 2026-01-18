const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');

/**
 * 查找俱樂部（支持內部ID或俱樂部ID）
 */
async function findClub(prisma, clubId) {
  // 先嘗試通過內部ID查找
  let club = await prisma.club.findUnique({
    where: { id: clubId },
  });

  // 如果找不到，嘗試通過俱樂部ID查找
  if (!club) {
    club = await prisma.club.findUnique({
      where: { clubId: clubId },
    });
  }

  return club;
}

async function createClubActivity(prisma, clubId, type, options = {}) {
  const {
    actorPlayerId = null,
    targetPlayerId = null,
    actorNickname = null,
    targetNickname = null,
  } = options;

  try {
    let resolvedActorNickname = actorNickname;
    let resolvedTargetNickname = targetNickname;

    if (!resolvedActorNickname && actorPlayerId) {
      const actor = await prisma.player.findUnique({
        where: { id: actorPlayerId },
        select: { nickname: true },
      });
      resolvedActorNickname = actor?.nickname ?? null;
    }

    if (!resolvedTargetNickname && targetPlayerId) {
      const target = await prisma.player.findUnique({
        where: { id: targetPlayerId },
        select: { nickname: true },
      });
      resolvedTargetNickname = target?.nickname ?? null;
    }

    await prisma.clubActivity.create({
      data: {
        clubId,
        type,
        actorPlayerId,
        targetPlayerId,
        actorNickname: resolvedActorNickname,
        targetNickname: resolvedTargetNickname,
      },
    });
  } catch (e) {
    console.error('[Clubs API] 寫入俱樂部動態失敗:', e);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeBoolPermissions(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const allowedKeys = [
    'modifyClubRules',
    'manageRoomCards',
    'approveJoinRequests',
    'kickMembers',
    'banMembers',
    'banSameTable',
    'setScoreLimit',
  ];
  const out = {};
  for (const key of allowedKeys) {
    out[key] = raw[key] === true;
  }
  const anyTrue = allowedKeys.some(k => out[k] === true);
  return anyTrue ? out : null;
}

function getCoLeaderPerms(member) {
  const perms = member?.coLeaderPermissions;
  if (!perms || typeof perms !== 'object') return null;
  return perms;
}

async function requireClubOwnerOrPermission(prisma, clubInternalId, actorPlayerId, permissionKey) {
  const club = await prisma.club.findUnique({
    where: { id: clubInternalId },
    select: { creatorId: true },
  });
  if (!club) {
    return { ok: false, status: 404, error: '俱樂部不存在' };
  }
  const isOwner = club.creatorId === actorPlayerId;
  if (isOwner) {
    return { ok: true, clubCreatorId: club.creatorId };
  }

  const actorMember = await prisma.clubMember.findUnique({
    where: { clubId_playerId: { clubId: clubInternalId, playerId: actorPlayerId } },
    select: { role: true, coLeaderPermissions: true },
  });
  const perms = getCoLeaderPerms(actorMember);
  const allowed = actorMember?.role === 'CO_LEADER' && perms?.[permissionKey] === true;
  if (!allowed) {
    return { ok: false, status: 403, error: '沒有權限' };
  }
  return { ok: true, clubCreatorId: club.creatorId };
}

/**
 * GET /api/client/clubs
 * 獲取所有俱樂部
 */
router.get('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const clubs = await prisma.club.findMany({
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, clubs);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部列表失敗:', error);
    return errorResponse(res, '獲取俱樂部列表失敗', null, 500);
  }
});

/**
 * POST /api/client/clubs
 * 創建俱樂部
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { name, creatorId, avatarUrl } = req.body;

    if (!name || !name.trim()) {
      return errorResponse(res, '請輸入俱樂部名稱', null, 400);
    }

    if (!creatorId) {
      return errorResponse(res, '請提供創建者ID', null, 400);
    }

    // 檢查創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: creatorId },
    });

    if (!creator) {
      return errorResponse(res, '創建者不存在', null, 404);
    }

    // 生成唯一的6位數字ID
    const clubId = await generateUniqueId(async (id) => {
      const exists = await prisma.club.findUnique({
        where: { clubId: id },
      });
      return !exists;
    });

    // 創建俱樂部
    const club = await prisma.club.create({
      data: {
        clubId,
        name: name.trim(),
        creatorId,
        avatarUrl: avatarUrl || null,
        cardCount: 0,
      },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
      },
    });

    // 將創建者添加為成員
    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        playerId: creatorId,
      },
    });

    // 重新獲取包含成員的俱樂部
    const clubWithMembers = await prisma.club.findUnique({
      where: { id: club.id },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
    });

    return successResponse(res, clubWithMembers, '俱樂部創建成功');
  } catch (error) {
    console.error('[Clubs API] 創建俱樂部失敗:', error);
    return errorResponse(res, '創建俱樂部失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId
 * 獲取單個俱樂部詳細資訊
 */
router.get('/:clubId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    // 獲取完整資訊
    const fullClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: {
        id: true,
        clubId: true,
        name: true,
        cardCount: true,
        avatarUrl: true,
        logoUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        members: {
          include: {
            player: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                cardCount: true,
              },
            },
          },
        },
      },
    });

    return successResponse(res, fullClub);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部詳細資訊失敗:', error);
    return errorResponse(res, '獲取俱樂部詳細資訊失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/rooms
 * 獲取俱樂部的房間列表（包含目前房間內的玩家資訊）
 */
router.get('/:clubId/rooms', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const rooms = await prisma.room.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      include: {
        participants: {
          where: { leftAt: null },
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
    });

    const data = rooms.map((room) => ({
      id: room.id,
      roomId: room.roomId,
      status: room.status,
      currentPlayers: room.currentPlayers,
      maxPlayers: room.maxPlayers,
      gameSettings: room.gameSettings,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      players: (room.participants || []).map((p) => ({
        id: p.player?.id ?? p.playerId ?? null,
        userId: p.player?.userId ?? null,
        name: p.player?.nickname ?? '',
        avatarUrl: p.player?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
    }));

    return successResponse(res, data);
  } catch (error) {
    console.error('[Clubs API] 獲取房間列表失敗:', error);
    return errorResponse(res, '獲取房間列表失敗', null, 500);
  }
});

router.post('/:clubId/join-requests', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const existingMember = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (existingMember) {
      return errorResponse(res, '玩家已經是俱樂部成員', null, 400);
    }

    const existingRequest = await prisma.clubJoinRequest.findFirst({
      where: { clubId: club.id, playerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });
    if (existingRequest) {
      return successResponse(res, existingRequest, '加入申請已送出');
    }

    const request = await prisma.clubJoinRequest.create({
      data: { clubId: club.id, playerId, status: 'PENDING' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });

    await createClubActivity(prisma, club.id, 'JOIN_REQUESTED', {
      actorPlayerId: playerId,
      targetPlayerId: playerId,
      actorNickname: request.player?.nickname ?? player.nickname ?? null,
      targetNickname: request.player?.nickname ?? player.nickname ?? null,
    });

    return successResponse(res, request, '加入申請已送出');
  } catch (error) {
    console.error('[Clubs API] 建立加入申請失敗:', error);
    return errorResponse(res, '加入申請失敗', error.message, 500);
  }
});

router.get('/:clubId/activity', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const limitRaw = req.query.limit;
    const limitParsed = Number(limitRaw);
    const limit = Number.isFinite(limitParsed)
      ? Math.min(Math.max(limitParsed, 1), 200)
      : 50;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const rows = await prisma.clubActivity.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return successResponse(res, rows);
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部動態失敗:', error);
    return errorResponse(res, '獲取俱樂部動態失敗', error.message, 500);
  }
});

router.get('/:clubId/join-requests', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const actorPlayerId = req.query.actorPlayerId;
    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const canReview = actorMember?.role === 'CO_LEADER' && perms?.approveJoinRequests === true;
      if (!canReview) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const rawStatus = (req.query.status || 'PENDING').toString().toUpperCase();
    const status = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(rawStatus)
      ? rawStatus
      : 'PENDING';

    const requests = await prisma.clubJoinRequest.findMany({
      where: { clubId: club.id, status },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    });

    return successResponse(res, requests);
  } catch (error) {
    console.error('[Clubs API] 獲取加入申請列表失敗:', error);
    return errorResponse(res, '獲取加入申請列表失敗', error.message, 500);
  }
});

router.post('/:clubId/join-requests/:requestId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId, requestId } = req.params;
    const action = (req.query.action || '').toString().toLowerCase();
    const { actorPlayerId } = req.body || {};

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const request = await prisma.clubJoinRequest.findFirst({
      where: { id: requestId, clubId: club.id },
    });
    if (!request) {
      return errorResponse(res, '加入申請不存在', null, 404);
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'cancel') {
      return errorResponse(res, '無效的操作', null, 400);
    }

    if (action === 'cancel') {
      if (actorPlayerId !== request.playerId) {
        return errorResponse(res, '沒有權限', null, 403);
      }
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED' },
      });
      return successResponse(res, null, '已取消加入申請');
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const canReview = actorMember?.role === 'CO_LEADER' && perms?.approveJoinRequests === true;
      if (!canReview) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    if (action === 'approve') {
      const existingMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: request.playerId } },
      });
      if (!existingMember) {
        await prisma.clubMember.create({
          data: { clubId: club.id, playerId: request.playerId },
        });
      }
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED' },
      });
      await createClubActivity(prisma, club.id, 'JOIN_APPROVED', {
        actorPlayerId: actorPlayerId ?? null,
        targetPlayerId: request.playerId,
      });
      return successResponse(res, null, '已批准加入申請');
    }

    if (action === 'reject') {
      await prisma.clubJoinRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });
      await createClubActivity(prisma, club.id, 'JOIN_REJECTED', {
        actorPlayerId: actorPlayerId ?? null,
        targetPlayerId: request.playerId,
      });
      return successResponse(res, null, '已拒絕加入申請');
    }
  } catch (error) {
    console.error('[Clubs API] 更新加入申請失敗:', error);
    return errorResponse(res, '更新加入申請失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/rankings
 * 獲取俱樂部排行榜（暫以會員房卡數排序）
 */
router.get('/:clubId/rankings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id, isBanned: false },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            avatarUrl: true,
            cardCount: true,
          },
        },
      },
    });

    const rankings = members
      .map((m) => ({
        playerId: m.player?.id ?? null,
        userId: m.player?.userId ?? null,
        nickname: m.player?.nickname ?? '',
        avatarUrl: m.player?.avatarUrl ?? null,
        cardCount: m.player?.cardCount ?? 0,
        role: m.role,
      }))
      .sort((a, b) => (b.cardCount || 0) - (a.cardCount || 0));

    return successResponse(res, rankings);
  } catch (error) {
    console.error('[Clubs API] 獲取排行榜失敗:', error);
    return errorResponse(res, '獲取排行榜失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/match-history
 * 獲取俱樂部戰績（以房間記錄作為簡化版戰績）
 */
router.get('/:clubId/match-history', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const rooms = await prisma.room.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
    });

    const history = rooms.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      participants: (r.participants || []).map((p) => ({
        playerId: p.player?.id ?? p.playerId ?? null,
        userId: p.player?.userId ?? null,
        nickname: p.player?.nickname ?? '',
        avatarUrl: p.player?.avatarUrl ?? null,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt,
      })),
    }));

    return successResponse(res, history);
  } catch (error) {
    console.error('[Clubs API] 獲取戰績失敗:', error);
    return errorResponse(res, '獲取戰績失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/rooms
 * 創建房間
 */
router.post('/:clubId/rooms', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { maxPlayers, creatorId, gameSettings } = req.body;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    // 如果沒有提供 creatorId，使用俱樂部的創建者
    const roomCreatorId = creatorId || club.creatorId;

    // 驗證創建者是否存在
    const creator = await prisma.player.findUnique({
      where: { id: roomCreatorId },
    });

    if (!creator) {
      return errorResponse(res, '創建者不存在', null, 404);
    }

    // 生成唯一的6位數字ID
    const roomId = await generateUniqueId(async (id) => {
      const exists = await prisma.room.findUnique({
        where: { roomId: id },
      });
      return !exists;
    });

    // 構建完整的遊戲設定
    let finalGameSettings = gameSettings || club.gameSettings || {};

    // 確保遊戲設定包含所有必要的字段
    if (gameSettings) {
      finalGameSettings = {
        base_points: gameSettings.base_points || 100,
        scoring_unit: gameSettings.scoring_unit || 20,
        rounds: gameSettings.rounds || 4,
        game_type: gameSettings.game_type || 'NORTHERN',
        special_rules: gameSettings.special_rules || {
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

    // 創建房間
    const room = await prisma.room.create({
      data: {
        roomId,
        clubId: club.id,
        creatorId: roomCreatorId,
        currentPlayers: 0,
        maxPlayers: maxPlayers || 4,
        status: 'WAITING',
        gameSettings: finalGameSettings,
      },
    });

    return successResponse(res, room, '房間創建成功');
  } catch (error) {
    console.error('[Clubs API] 創建房間失敗:', error);
    return errorResponse(res, '創建房間失敗', error.message, 500);
  }
});

/**
 * GET /api/client/players/:playerId/clubs
 * 獲取玩家加入的俱樂部列表
 */
router.get('/players/:playerId/clubs', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId } = req.params;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const memberships = await prisma.clubMember.findMany({
      where: { playerId: playerId },
      include: {
        club: {
          select: {
            id: true,
            clubId: true,
            name: true,
            cardCount: true,
            avatarUrl: true,
            creator: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
              },
            },
            members: {
              select: {
                id: true,
                playerId: true,
                role: true,
                bannedTablePlayers: true,
                player: {
                  select: {
                    id: true,
                    userId: true,
                    nickname: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    // 將 memberships 轉換為 clubs 陣列（前端期望的格式）
    const clubs = memberships.map((membership) => membership.club);

    return successResponse(res, clubs);
  } catch (error) {
    console.error('[Clubs API] 獲取玩家俱樂部列表失敗:', error);
    return errorResponse(res, '獲取玩家俱樂部列表失敗', null, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/members
 * 獲取俱樂部成員列表
 */
router.get('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return successResponse(res, members);
  } catch (error) {
    console.error('[Clubs API] 獲取成員列表失敗:', error);
    return errorResponse(res, '獲取成員列表失敗', null, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members
 * 添加成員到俱樂部（加入俱樂部）
 */
router.post('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId } = req.body;

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    // 檢查玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    // 檢查是否已經是成員
    const existingMember = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    if (existingMember) {
      return errorResponse(res, '玩家已經是俱樂部成員', null, 400);
    }

    // 添加成員
    const member = await prisma.clubMember.create({
      data: {
        clubId: club.id,
        playerId: playerId,
      },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
    });

    return successResponse(res, member, '成員添加成功');
  } catch (error) {
    console.error('[Clubs API] 添加成員失敗:', error);
    return errorResponse(res, '添加成員失敗', error.message, 500);
  }
});

/**
 * DELETE /api/client/clubs/:clubId/members
 * 退出俱樂部（刪除成員）
 */
router.delete('/:clubId/members', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId, action } = req.query;

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const resolvedAction = (action || '').toString().toLowerCase();
    const actorId = isNonEmptyString(actorPlayerId) ? actorPlayerId.toString() : null;
    const isKick = resolvedAction === 'kick' || (actorId && actorId !== playerId.toString());
    if (isKick) {
      if (!isNonEmptyString(actorId)) {
        return errorResponse(res, '請提供操作者ID', null, 400);
      }
    } else {
      if (actorId && actorId !== playerId.toString()) {
        return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId.toString()) {
      return errorResponse(res, '不可移除擁有者', null, 400);
    }

    if (isKick) {
      const authz = await requireClubOwnerOrPermission(
        prisma,
        club.id,
        actorId,
        'kickMembers'
      );
      if (!authz.ok) {
        return errorResponse(res, authz.error, null, authz.status);
      }
    }

    // 檢查成員是否存在
    const member = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    // 刪除成員
    await prisma.clubMember.delete({
      where: {
        clubId_playerId: {
          clubId: club.id,
          playerId: playerId,
        },
      },
    });

    await createClubActivity(prisma, club.id, isKick ? 'MEMBER_KICKED' : 'MEMBER_LEFT', {
      actorPlayerId: (actorId ?? playerId.toString()),
      targetPlayerId: playerId.toString(),
    });

    return successResponse(res, null, '退出俱樂部成功');
  } catch (error) {
    console.error('[Clubs API] 退出俱樂部失敗:', error);
    return errorResponse(res, '退出俱樂部失敗', error.message, 500);
  }
});

router.post('/:clubId/members/role', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, role, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const nextRole = (role ?? '').toString().toUpperCase();
    if (nextRole !== 'CO_LEADER' && nextRole !== 'MEMBER') {
      return errorResponse(res, '無效的角色', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId !== actorPlayerId) {
      return errorResponse(res, '沒有權限', null, 403);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: nextRole === 'MEMBER' ? { role: nextRole, coLeaderPermissions: null } : { role: nextRole },
    });

    return successResponse(res, updated, '更新成員角色成功');
  } catch (error) {
    console.error('[Clubs API] 更新成員角色失敗:', error);
    return errorResponse(res, '更新成員角色失敗', error.message, 500);
  }
});

router.post('/:clubId/members/ban', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可封禁擁有者', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banMembers'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { isBanned: true },
    });

    await createClubActivity(prisma, club.id, 'MEMBER_KICKED', {
      actorPlayerId: actorPlayerId ?? null,
      targetPlayerId: playerId,
    });

    return successResponse(res, updated, '封禁成員成功');
  } catch (error) {
    console.error('[Clubs API] 封禁成員失敗:', error);
    return errorResponse(res, '封禁成員失敗', error.message, 500);
  }
});

router.post('/:clubId/members/unban', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banMembers'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { isBanned: false },
    });

    return successResponse(res, updated, '解禁成員成功');
  } catch (error) {
    console.error('[Clubs API] 解禁成員失敗:', error);
    return errorResponse(res, '解禁成員失敗', error.message, 500);
  }
});

router.post('/:clubId/members/score-limit', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, scoreLimit, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'setScoreLimit'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const parsed =
      scoreLimit === null || scoreLimit === undefined
        ? null
        : Number.isFinite(Number(scoreLimit))
        ? Number(scoreLimit)
        : null;

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { scoreLimit: parsed },
    });

    return successResponse(res, updated, '設定分數上限成功');
  } catch (error) {
    console.error('[Clubs API] 設定分數上限失敗:', error);
    return errorResponse(res, '設定分數上限失敗', error.message, 500);
  }
});

router.post('/:clubId/members/no-same-table', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, enabled, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banSameTable'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { noSameTable: Boolean(enabled) },
    });

    return successResponse(res, updated, '設定禁止同桌成功');
  } catch (error) {
    console.error('[Clubs API] 設定禁止同桌失敗:', error);
    return errorResponse(res, '設定禁止同桌失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members/banned-table-players
 * 設定禁止同桌的玩家列表
 */
router.post('/:clubId/members/banned-table-players', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, bannedPlayerIds, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'banSameTable'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { bannedTablePlayers: bannedPlayerIds || [] },
    });

    return successResponse(res, updated, '設定禁止同桌玩家成功');
  } catch (error) {
    console.error('[Clubs API] 設定禁止同桌玩家失敗:', error);
    return errorResponse(res, '設定禁止同桌失敗', error.message, 500);
  }
});

/**
 * POST /api/client/clubs/:clubId/members/co-leader-permissions
 * 設定副會長權限
 */
router.post('/:clubId/members/co-leader-permissions', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { playerId, permissions, actorPlayerId } = req.body || {};

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (club.creatorId !== actorPlayerId) {
      return errorResponse(res, '沒有權限', null, 403);
    }

    if (club.creatorId === playerId) {
      return errorResponse(res, '不可修改擁有者設定', null, 400);
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: club.id, playerId } },
    });
    if (!member) {
      return errorResponse(res, '玩家不是俱樂部成員', null, 404);
    }

    if (member.role !== 'CO_LEADER') {
      return errorResponse(res, '僅可設定副會長權限', null, 400);
    }

    const normalized = normalizeBoolPermissions(permissions);

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: club.id, playerId } },
      data: { coLeaderPermissions: normalized },
    });

    return successResponse(res, updated, '設定副會長權限成功');
  } catch (error) {
    console.error('[Clubs API] 設定副會長權限失敗:', error);
    return errorResponse(res, '設定副會長權限失敗', error.message, 500);
  }
});

/**
 * PUT /api/client/clubs/:clubId
 * 更新俱樂部資訊（名稱/描述/Logo/房卡數）
 */
router.put('/:clubId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { name, description, logoUrl, cardCount, actorPlayerId } = req.body || {};

    if (
      name === undefined &&
      description === undefined &&
      logoUrl === undefined &&
      cardCount === undefined
    ) {
      return errorResponse(res, '請提供要更新的欄位', null, 400);
    }

    const club = await findClub(prisma, clubId);
    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const isOwner = club.creatorId === actorPlayerId;
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: club.id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      });
      const perms = getCoLeaderPerms(actorMember);
      const needsModifyRules = name !== undefined || description !== undefined || logoUrl !== undefined;
      const needsManageCards = cardCount !== undefined;
      if (needsModifyRules) {
        const canModify = actorMember?.role === 'CO_LEADER' && perms?.modifyClubRules === true;
        if (!canModify) return errorResponse(res, '沒有權限', null, 403);
      }
      if (needsManageCards) {
        const canManage = actorMember?.role === 'CO_LEADER' && perms?.manageRoomCards === true;
        if (!canManage) return errorResponse(res, '沒有權限', null, 403);
      }
    }

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = String(description);
    if (logoUrl !== undefined) data.logoUrl = logoUrl ? String(logoUrl) : null;
    if (cardCount !== undefined) data.cardCount = Number(cardCount) || 0;

    const updated = await prisma.club.update({
      where: { id: club.id },
      data,
      select: {
        id: true,
        clubId: true,
        name: true,
        cardCount: true,
        avatarUrl: true,
        logoUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return successResponse(res, updated, '俱樂部資訊已更新');
  } catch (error) {
    console.error('[Clubs API] 更新俱樂部資訊失敗:', error);
    return errorResponse(res, '更新俱樂部資訊失敗', error.message, 500);
  }
});

/**
 * GET /api/client/clubs/:clubId/game-settings
 * 獲取俱樂部遊戲設定
 */
router.get('/:clubId/game-settings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const fullClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: {
        id: true,
        clubId: true,
        name: true,
        gameSettings: true,
      },
    });

    return successResponse(res, {
      game_settings: fullClub.gameSettings || null,
    });
  } catch (error) {
    console.error('[Clubs API] 獲取俱樂部遊戲設定失敗:', error);
    return errorResponse(res, '獲取俱樂部遊戲設定失敗', error.message, 500);
  }
});

/**
 * PUT /api/client/clubs/:clubId/game-settings
 * 更新俱樂部遊戲設定
 */
router.put('/:clubId/game-settings', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { clubId } = req.params;
    const { gameSettings, actorPlayerId } = req.body;

    if (!gameSettings) {
      return errorResponse(res, '請提供遊戲設定', null, 400);
    }

    if (!isNonEmptyString(actorPlayerId)) {
      return errorResponse(res, '請提供操作者ID', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
    }

    const authz = await requireClubOwnerOrPermission(
      prisma,
      club.id,
      actorPlayerId,
      'modifyClubRules'
    );
    if (!authz.ok) {
      return errorResponse(res, authz.error, null, authz.status);
    }

    // 更新遊戲設定
    const updatedClub = await prisma.club.update({
      where: { id: club.id },
      data: {
        gameSettings: gameSettings,
      },
      select: {
        id: true,
        clubId: true,
        name: true,
        gameSettings: true,
      },
    });

    return successResponse(res, {
      game_settings: updatedClub.gameSettings,
    }, '遊戲設定更新成功');
  } catch (error) {
    console.error('[Clubs API] 更新俱樂部遊戲設定失敗:', error);
    return errorResponse(res, '更新俱樂部遊戲設定失敗', error.message, 500);
  }
});

module.exports = router;
