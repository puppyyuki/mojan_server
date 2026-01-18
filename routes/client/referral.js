const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

router.post('/bind', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId, referrerCode } = req.body;

    if (!playerId || !referrerCode) {
      return errorResponse(res, '缺少 playerId 或 referrerCode', null, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) {
        return { ok: false, status: 404, message: '玩家不存在' };
      }

      if (player.hasBoundReferrer || player.referrerId) {
        return { ok: false, status: 400, message: '已綁定邀請碼' };
      }

      if (player.userId === String(referrerCode)) {
        return { ok: false, status: 400, message: '不能輸入自己的邀請碼' };
      }

      const referrer = await tx.player.findUnique({
        where: { userId: String(referrerCode) },
      });
      if (!referrer) {
        return { ok: false, status: 404, message: '邀請碼不存在' };
      }

      const adminUser = await tx.user.findFirst({ where: { role: 'ADMIN' } });

      await tx.player.update({
        where: { id: playerId },
        data: {
          referrerId: referrer.id,
          hasBoundReferrer: true,
          cardCount: { increment: 8 },
        },
      });

      if (adminUser) {
        await tx.cardRechargeRecord.create({
          data: {
            playerId,
            adminUserId: adminUser.id,
            amount: 8,
            previousCount: player.cardCount,
            newCount: player.cardCount + 8,
          },
        });
      }

      const updatedReferrer = await tx.player.update({
        where: { id: referrer.id },
        data: {
          referralCount: { increment: 1 },
          cardCount: { increment: 4 },
        },
      });

      if (adminUser) {
        await tx.cardRechargeRecord.create({
          data: {
            playerId: referrer.id,
            adminUserId: adminUser.id,
            amount: 4,
            previousCount: referrer.cardCount,
            newCount: referrer.cardCount + 4,
          },
        });
      }

      if (updatedReferrer.referralCount >= 20 && !updatedReferrer.isAgent) {
        await tx.player.update({
          where: { id: referrer.id },
          data: { isAgent: true },
        });
      }

      return { ok: true };
    });

    if (!result.ok) {
      return errorResponse(res, result.message, null, result.status);
    }

    return successResponse(res, { success: true }, '綁定成功');
  } catch (error) {
    console.error('[Referral API] 綁定邀請碼失敗:', error);
    return errorResponse(res, '綁定邀請碼失敗', null, 500);
  }
});

router.get('/info', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId } = req.query;

    if (!playerId) {
      return errorResponse(res, '缺少 playerId', null, 400);
    }

    const player = await prisma.player.findUnique({
      where: { id: String(playerId) },
      include: {
        referredPlayers: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const selfReward = player.hasBoundReferrer ? 8 : 0;
    const referralReward = (player.referralCount || 0) * 4;
    const totalRewards = selfReward + referralReward;

    return successResponse(
      res,
      {
        referralCode: player.userId,
        referralCount: player.referralCount || 0,
        hasBoundReferrer: player.hasBoundReferrer || false,
        totalRewards,
        referredPlayers: player.referredPlayers || [],
      },
      '獲取成功'
    );
  } catch (error) {
    console.error('[Referral API] 獲取推廣資訊失敗:', error);
    return errorResponse(res, '獲取推廣資訊失敗', null, 500);
  }
});

module.exports = router;

