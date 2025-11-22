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
 * 獲取俱樂部的房間列表
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
    });

    return successResponse(res, rooms);
  } catch (error) {
    console.error('[Clubs API] 獲取房間列表失敗:', error);
    return errorResponse(res, '獲取房間列表失敗', null, 500);
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
    const { playerId } = req.query;

    if (!playerId) {
      return errorResponse(res, '請提供玩家ID', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
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

    return successResponse(res, null, '退出俱樂部成功');
  } catch (error) {
    console.error('[Clubs API] 退出俱樂部失敗:', error);
    return errorResponse(res, '退出俱樂部失敗', error.message, 500);
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
    const { gameSettings } = req.body;

    if (!gameSettings) {
      return errorResponse(res, '請提供遊戲設定', null, 400);
    }

    const club = await findClub(prisma, clubId);

    if (!club) {
      return errorResponse(res, '俱樂部不存在', null, 404);
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

