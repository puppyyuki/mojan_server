const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const iapVerification = require('../lib/iap_verification');

const prisma = new PrismaClient();

// 商品 ID 對應的房卡數量（必須與前端和 Google Play/App Store 一致）
const PRODUCT_CARD_AMOUNTS = {
    'room_card_20': 20,    // 20 張房卡 - NT$ 100
    'room_card_50': 50,    // 50 張房卡 - NT$ 250
    'room_card_200': 200,  // 200 張房卡 - NT$ 1000
};

/**
 * 獲取可用的內購商品列表
 * GET /api/iap/products
 */
router.get('/products', async (req, res) => {
    try {
        const products = Object.entries(PRODUCT_CARD_AMOUNTS).map(([productId, cardAmount]) => ({
            id: productId,
            cardAmount: cardAmount,
            type: 'consumable',
        }));

        res.json({
            success: true,
            products: products,
        });
    } catch (error) {
        console.error('獲取商品列表失敗:', error);
        res.status(500).json({
            success: false,
            error: '獲取商品列表失敗',
        });
    }
});

/**
 * 驗證購買並發放房卡
 * POST /api/iap/verify
 * 
 * Body:
 * {
 *   platform: 'android' | 'ios',
 *   playerId: string,
 *   productId: string,
 *   purchaseToken: string (Android),
 *   receiptData: string (iOS),
 *   transactionId: string (iOS)
 * }
 */
router.post('/verify', async (req, res) => {
    try {
        const { platform, playerId, productId, purchaseToken, receiptData, transactionId } = req.body;

        console.log('📥 收到驗證請求:', {
            platform,
            playerId,
            productId,
            hasPurchaseToken: !!purchaseToken,
            hasReceiptData: !!receiptData,
            hasTransactionId: !!transactionId
        });

        // 驗證必要參數
        if (!platform || !playerId || !productId) {
            console.log('❌ 缺少必要參數:', { platform, playerId, productId });
            return res.status(400).json({
                success: false,
                error: '缺少必要參數',
                details: {
                    platform: !!platform,
                    playerId: !!playerId,
                    productId: !!productId
                }
            });
        }

        // 檢查玩家是否存在
        const player = await prisma.player.findUnique({
            where: { id: playerId },
        });

        if (!player) {
            return res.status(404).json({
                success: false,
                error: '玩家不存在',
            });
        }

        // 檢查商品是否有效
        const cardAmount = PRODUCT_CARD_AMOUNTS[productId];
        if (!cardAmount) {
            return res.status(400).json({
                success: false,
                error: '無效的商品 ID',
            });
        }

        // 準備購買資料
        const purchaseData = platform === 'android'
            ? { productId, purchaseToken }
            : { receiptData };

        // 檢查是否已處理過此購買（防止重複發放）
        const uniqueId = platform === 'android' ? purchaseToken : transactionId;
        const existingPurchase = await prisma.purchase.findUnique({
            where: { transactionId: uniqueId },
        });

        if (existingPurchase) {
            return res.status(400).json({
                success: false,
                error: '此購買已處理過',
                alreadyProcessed: true,
            });
        }

        // 驗證收據
        const verificationResult = await iapVerification.verifyPurchase(platform, purchaseData);

        if (!verificationResult.valid) {
            return res.status(400).json({
                success: false,
                error: '收據驗證失敗',
                details: verificationResult.error,
            });
        }

        // 開始交易：發放房卡並記錄購買
        const result = await prisma.$transaction(async (tx) => {
            // 更新玩家房卡餘額
            const updatedPlayer = await tx.player.update({
                where: { id: playerId },
                data: {
                    cardCount: {
                        increment: cardAmount,
                    },
                },
            });

            // 記錄購買
            const purchase = await tx.purchase.create({
                data: {
                    transactionId: uniqueId,
                    playerId: playerId,
                    productId: productId,
                    platform: platform,
                    cardAmount: cardAmount,
                    status: 'completed',
                    purchaseData: JSON.stringify(verificationResult),
                    createdAt: new Date(),
                },
            });

            return { updatedPlayer, purchase };
        });

        // 消耗購買（Android 需要，iOS 不需要）
        if (platform === 'android') {
            await iapVerification.consumePurchase(platform, purchaseData);
        }

        console.log(`成功處理內購: 玩家 ${playerId} 購買 ${productId}，發放 ${cardAmount} 張房卡`);

        res.json({
            success: true,
            message: '購買成功',
            cardAmount: cardAmount,
            newBalance: result.updatedPlayer.cardCount,
            transactionId: uniqueId,
        });
    } catch (error) {
        console.error('驗證購買失敗:', error);
        res.status(500).json({
            success: false,
            error: '驗證購買失敗',
            details: error.message,
        });
    }
});

/**
 * 獲取玩家的購買記錄
 * GET /api/iap/purchases/:playerId
 */
router.get('/purchases/:playerId', async (req, res) => {
    try {
        const { playerId } = req.params;

        const purchases = await prisma.purchase.findMany({
            where: { playerId: playerId },
            orderBy: { createdAt: 'desc' },
            take: 50, // 最多返回 50 筆記錄
        });

        res.json({
            success: true,
            purchases: purchases,
        });
    } catch (error) {
        console.error('獲取購買記錄失敗:', error);
        res.status(500).json({
            success: false,
            error: '獲取購買記錄失敗',
        });
    }
});

module.exports = router;
