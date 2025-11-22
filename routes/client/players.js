const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');

/**
 * GET /api/client/players
 * 獲取所有玩家
 */
router.get('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const players = await prisma.player.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, players);
  } catch (error) {
    console.error('[Players API] 獲取玩家列表失敗:', error);
    return errorResponse(res, '獲取玩家列表失敗', null, 500);
  }
});

/**
 * GET /api/client/players/:id
 * 獲取單個玩家
 */
router.get('/:id', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { id } = req.params;
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        createdClubs: true,
        clubMembers: {
          include: {
            club: true,
          },
        },
      },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    return successResponse(res, player);
  } catch (error) {
    console.error('[Players API] 獲取玩家失敗:', error);
    return errorResponse(res, '獲取玩家失敗', null, 500);
  }
});

/**
 * POST /api/client/players
 * 創建玩家（通過暱稱或 LINE 登入）
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { nickname, lineUserId, displayName, pictureUrl } = req.body;

    // LINE 登入流程
    if (lineUserId) {
      // 檢查是否已存在該 LINE 帳號
      const existingLinePlayer = await prisma.player.findUnique({
        where: { lineUserId: lineUserId },
      });

      if (existingLinePlayer) {
        // 如果已存在，更新最後登入時間和頭像（如有變更）
        const updateData = {
          lastLoginAt: new Date(),
        };

        // 如果提供了新的頭像 URL，更新它
        if (pictureUrl && pictureUrl !== existingLinePlayer.avatarUrl) {
          updateData.avatarUrl = pictureUrl;
        }

        // 如果提供了新的顯示名稱且與現有暱稱不同，直接更新暱稱（允許重複）
        if (displayName && displayName.trim() && displayName.trim() !== existingLinePlayer.nickname) {
          updateData.nickname = displayName.trim();
        }

        const updatedPlayer = await prisma.player.update({
          where: { id: existingLinePlayer.id },
          data: updateData,
        });

        return successResponse(res, updatedPlayer, 'LINE 登入成功');
      }

      // 如果不存在，創建新玩家
      const finalNickname = (displayName && displayName.trim()) || `LINE用戶_${lineUserId.substring(0, 6)}`;

      // 生成唯一的6位數字ID
      const userId = await generateUniqueId(async (id) => {
        const exists = await prisma.player.findUnique({
          where: { userId: id },
        });
        return !exists;
      });

      const newPlayer = await prisma.player.create({
        data: {
          userId,
          nickname: finalNickname,
          lineUserId: lineUserId,
          avatarUrl: pictureUrl || null,
          cardCount: 0,
          lastLoginAt: new Date(),
        },
      });

      return successResponse(res, newPlayer, 'LINE 玩家創建成功');
    }

    // 傳統暱稱登入流程
    if (!nickname || !nickname.trim()) {
      return errorResponse(res, '請輸入暱稱或使用 LINE 登入', null, 400);
    }

    // 檢查暱稱是否已存在
    const existingPlayer = await prisma.player.findFirst({
      where: { nickname: nickname.trim() },
    });

    if (existingPlayer) {
      // 如果已存在，更新最後登入時間並返回現有玩家
      const updatedPlayer = await prisma.player.update({
        where: { id: existingPlayer.id },
        data: {
          lastLoginAt: new Date(),
        },
      });

      return successResponse(res, updatedPlayer, '使用現有玩家');
    }

    // 生成唯一的6位數字ID
    const userId = await generateUniqueId(async (id) => {
      const exists = await prisma.player.findUnique({
        where: { userId: id },
      });
      return !exists;
    });

    // 創建新玩家
    const player = await prisma.player.create({
      data: {
        userId,
        nickname: nickname.trim(),
        cardCount: 0,
        lastLoginAt: new Date(),
      },
    });

    return successResponse(res, player, '玩家創建成功');
  } catch (error) {
    console.error('[Players API] 創建玩家失敗:', error);
    return errorResponse(res, '創建玩家失敗', null, 500);
  }
});

/**
 * PATCH /api/client/players/:id
 * 更新玩家
 */
router.patch('/:id', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { id } = req.params;
    const { nickname, cardCount, bio } = req.body;

    const updateData = {};
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim();
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount);
    }
    if (bio !== undefined) {
      updateData.bio = bio === null || bio === '' ? null : bio.trim();
    }

    const player = await prisma.player.update({
      where: { id },
      data: updateData,
    });

    return successResponse(res, player, '玩家更新成功');
  } catch (error) {
    console.error('[Players API] 更新玩家失敗:', error);
    return errorResponse(res, '更新玩家失敗', null, 500);
  }
});

module.exports = router;

