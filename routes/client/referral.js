const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

const INVITE_SELF_REWARD = 6;
const REFERRER_PER_PHONE_REWARD = 2;

function maybePromoteAgent(tx, referrerId, referralCount) {
  if (referralCount >= 20) {
    return tx.player.updateMany({
      where: { id: referrerId, isAgent: false },
      data: { isAgent: true },
    });
  }
  return Promise.resolve();
}

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
      const bHadPhone = Boolean(player.phoneE164);

      await tx.player.update({
        where: { id: playerId },
        data: {
          referrerId: referrer.id,
          hasBoundReferrer: true,
          cardCount: { increment: INVITE_SELF_REWARD },
          phoneReferrerRewardGiven: bHadPhone,
        },
      });

      if (adminUser) {
        await tx.cardRechargeRecord.create({
          data: {
            playerId,
            adminUserId: adminUser.id,
            amount: INVITE_SELF_REWARD,
            previousCount: player.cardCount,
            newCount: player.cardCount + INVITE_SELF_REWARD,
            note: '邀請碼綁定獎勵',
          },
        });
      }

      if (bHadPhone) {
        const prevRefCards = referrer.cardCount;
        const updatedReferrer = await tx.player.update({
          where: { id: referrer.id },
          data: {
            referralCount: { increment: 1 },
            cardCount: { increment: REFERRER_PER_PHONE_REWARD },
          },
        });
        if (adminUser) {
          await tx.cardRechargeRecord.create({
            data: {
              playerId: referrer.id,
              adminUserId: adminUser.id,
              amount: REFERRER_PER_PHONE_REWARD,
              previousCount: prevRefCards,
              newCount: prevRefCards + REFERRER_PER_PHONE_REWARD,
              note: '推薦獎勵-被推薦人已綁定手機',
            },
          });
        }
        await maybePromoteAgent(tx, referrer.id, updatedReferrer.referralCount);
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
            phoneE164: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    const selfReward = player.hasBoundReferrer ? INVITE_SELF_REWARD : 0;
    const referralReward = (player.referralCount || 0) * REFERRER_PER_PHONE_REWARD;
    const totalRewards = selfReward + referralReward;

    const referredPlayers = (player.referredPlayers || []).map((p) => ({
      id: p.id,
      userId: p.userId,
      nickname: p.nickname,
      createdAt: p.createdAt,
      hasBoundPhone: Boolean(p.phoneE164),
    }));

    return successResponse(
      res,
      {
        referralCode: player.userId,
        referralCount: player.referralCount || 0,
        hasBoundReferrer: player.hasBoundReferrer || false,
        hasBoundPhone: Boolean(player.phoneE164),
        totalRewards,
        referredPlayers,
      },
      '獲取成功'
    );
  } catch (error) {
    console.error('[Referral API] 獲取推廣資訊失敗:', error);
    return errorResponse(res, '獲取推廣資訊失敗', null, 500);
  }
});

module.exports = router;
