const express = require('express');
const router = express.Router();
const { successResponse, errorResponse } = require('../../utils/response');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/account-deletion-requests/status/:playerId
 * 查詢該玩家是否有「申請中」的刪除請求
 */
router.get('/status/:playerId', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId } = req.params;

    const pending = await prisma.accountDeletionRequest.findFirst({
      where: { playerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      return successResponse(res, { pending: false });
    }

    return successResponse(res, {
      pending: true,
      requestId: pending.id,
      scheduledDeletionAt: pending.scheduledDeletionAt,
      createdAt: pending.createdAt,
    });
  } catch (error) {
    console.error('[AccountDeletion] status 失敗:', error);
    return errorResponse(res, '查詢失敗', null, 500);
  }
});

/**
 * POST /api/account-deletion-requests/revoke
 * body: { playerId }
 */
router.post('/revoke', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId } = req.body || {};

    if (!playerId || typeof playerId !== 'string') {
      return errorResponse(res, '缺少 playerId', null, 400);
    }

    const pending = await prisma.accountDeletionRequest.findFirst({
      where: { playerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pending) {
      return errorResponse(res, '沒有進行中的刪除申請', null, 404);
    }

    await prisma.accountDeletionRequest.update({
      where: { id: pending.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    return successResponse(res, { revoked: true });
  } catch (error) {
    console.error('[AccountDeletion] revoke 失敗:', error);
    return errorResponse(res, '撤銷失敗', null, 500);
  }
});

/**
 * POST /api/account-deletion-requests
 * body: { playerId, submittedNickname, submittedUserId, reason }
 */
router.post('/', async (req, res) => {
  try {
    const { prisma } = req.app.locals;
    const { playerId, submittedNickname, submittedUserId, reason } = req.body || {};

    if (!playerId || typeof playerId !== 'string') {
      return errorResponse(res, '缺少 playerId', null, 400);
    }
    if (!submittedNickname || !String(submittedNickname).trim()) {
      return errorResponse(res, '請填寫玩家暱稱', null, 400);
    }
    if (!submittedUserId || !String(submittedUserId).trim()) {
      return errorResponse(res, '請填寫玩家 ID', null, 400);
    }
    if (!reason || !String(reason).trim()) {
      return errorResponse(res, '請填寫刪除原因', null, 400);
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      return errorResponse(res, '玩家不存在', null, 404);
    }

    if (player.nickname.trim() !== String(submittedNickname).trim()) {
      return errorResponse(res, '玩家暱稱與帳號不符', null, 400);
    }
    if (player.userId !== String(submittedUserId).trim()) {
      return errorResponse(res, '玩家 ID 與帳號不符', null, 400);
    }

    const existingPending = await prisma.accountDeletionRequest.findFirst({
      where: { playerId, status: 'PENDING' },
    });

    if (existingPending) {
      return errorResponse(res, '已有進行中的帳號刪除申請', null, 409);
    }

    const now = new Date();
    const scheduledDeletionAt = new Date(now.getTime() + SEVEN_DAYS_MS);

    const created = await prisma.accountDeletionRequest.create({
      data: {
        playerId,
        submittedNickname: String(submittedNickname).trim(),
        submittedUserId: String(submittedUserId).trim(),
        reason: String(reason).trim(),
        status: 'PENDING',
        scheduledDeletionAt,
      },
    });

    return successResponse(res, {
      id: created.id,
      scheduledDeletionAt: created.scheduledDeletionAt,
    });
  } catch (error) {
    console.error('[AccountDeletion] submit 失敗:', error);
    return errorResponse(res, '提交失敗', null, 500);
  }
});

module.exports = router;
