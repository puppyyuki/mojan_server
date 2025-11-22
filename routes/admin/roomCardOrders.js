const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

/**
 * GET /api/admin/room-card-orders
 * 獲取房卡訂單列表（後台用）
 */
router.get('/room-card-orders', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const orders = await prisma.roomCardOrder.findMany({
      include: {
        player: {
          select: {
            userId: true,
            nickname: true,
            avatarUrl: true,
          },
        },
        product: {
          select: {
            id: true,
            cardAmount: true,
            price: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(res, orders);
  } catch (error) {
    console.error('[Admin API] 獲取訂單列表失敗:', error);
    return errorResponse(res, '獲取訂單列表失敗', error.message, 500);
  }
});

module.exports = router;

