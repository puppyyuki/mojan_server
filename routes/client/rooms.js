const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');
const { generateUniqueId } = require('../../utils/idGenerator');

/**
 * POST /api/client/rooms
 * 在大廳建立房間（不關聯任何俱樂部）
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { maxPlayers, creatorId, gameSettings } = req.body;

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
        gameSettings: finalGameSettings,
      },
    });

    return successResponse(res, room, '房間創建成功');
  } catch (error) {
    console.error('[Rooms API] 大廳建立房間失敗:', error);
    return errorResponse(res, '建立房間失敗', error.message, 500);
  }
});

module.exports = router;
