const express = require('express');

const router = express.Router();

/**
 * Apple App Store Server Notifications V2
 * POST /api/apple/notifications
 *
 * 目前先做穩定接收與紀錄，避免 Apple 通知打到 404/HTML。
 * 後續可在這裡加入 JWS 驗證與通知事件處理。
 */
router.post('/notifications', async (req, res) => {
    try {
        const { signedPayload } = req.body || {};

        if (!signedPayload || typeof signedPayload !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'missing signedPayload',
            });
        }

        // 先只紀錄基本資訊，避免在 log 中洩漏完整 payload
        console.log('[AppleNotifications] received signedPayload length:', signedPayload.length);

        return res.status(200).json({
            success: true,
            received: true,
        });
    } catch (error) {
        console.error('[AppleNotifications] handle failed:', error);
        return res.status(500).json({
            success: false,
            error: 'internal error',
        });
    }
});

/**
 * 供部署檢查用（可在瀏覽器直接打開確認路由存在）
 * GET /api/apple/notifications
 */
router.get('/notifications', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Apple notifications endpoint is ready',
    });
});

module.exports = router;
