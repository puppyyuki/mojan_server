const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma');
const iapVerification = require('../lib/iap_verification');

// Product ID 對應的房卡數量（必須與前端和 Google Play/App Store 一致）
// 重要：根據測試，Google Play Billing Library 支援使用 Product ID 查詢（向後兼容）
// 之前 room_card_50 可以查到，表示可以使用 Product ID 查詢
// Google Play Console 中：
// - Product ID: room_card_20_v2 (用於查詢和購買)
// - Purchase Option ID: room-card-20-buy (備用)
// App Store Connect 中：
// - Product ID: room_card_20_v2, room_card_50_v2, room_card_200_v2 (所有平台統一使用 _v2)
const PRODUCT_CARD_AMOUNTS = {
    // 所有平台統一使用 _v2 結尾的 Product ID
    'room_card_20_v2': 20,    // 20 張房卡 - iOS/Android Product ID
    'room_card_50_v2': 50,    // 50 張房卡 - iOS/Android Product ID
    'room_card_200_v2': 200,  // 200 張房卡 - iOS/Android Product ID
    // Android (Google Play) - Purchase Option ID（備用）
    'room-card-20-buy': 20,
    'room-card-50-buy': 50,
    'room-card-200-buy': 200,
    // iOS 舊版商品 ID 別名
    'room_card_20': 20,
    'room_card_50': 50,
    'room_card_200': 200,
};

const PRODUCT_ALIAS_CANONICAL = {
    'room_card_20': 'room_card_20_v2',
    'room_card_50': 'room_card_50_v2',
    'room_card_200': 'room_card_200_v2',
    'room_card_20_v2': 'room_card_20_v2',
    'room_card_50_v2': 'room_card_50_v2',
    'room_card_200_v2': 'room_card_200_v2',
    'room-card-20-buy': 'room_card_20_v2',
    'room-card-50-buy': 'room_card_50_v2',
    'room-card-200-buy': 'room_card_200_v2',
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

        // 驗證必要參數
        if (!platform || !playerId || !productId) {
            const missingParams = [];
            if (!platform) missingParams.push('platform');
            if (!playerId) missingParams.push('playerId');
            if (!productId) missingParams.push('productId');

            return res.status(400).json({
                success: false,
                error: '缺少必要參數',
                missingParams: missingParams,
            });
        }

        // 驗證平台參數
        if (platform !== 'android' && platform !== 'ios') {
            return res.status(400).json({
                success: false,
                error: '無效的平台參數',
                details: 'platform 必須是 "android" 或 "ios"',
            });
        }

        // 驗證平台特定參數
        if (platform === 'android' && !purchaseToken) {
            return res.status(400).json({
                success: false,
                error: 'Android 平台缺少 purchaseToken',
            });
        }

        // iOS 驗證：新的 App Store Server API 只需要 transactionId
        // 舊的 Receipt Validation API 需要 receiptData
        // 如果設定了新的 API 金鑰，只需要 transactionId；否則需要 receiptData
        if (platform === 'ios') {
            const useNewAPI = !!(process.env.APP_STORE_CONNECT_ISSUER_ID && 
                                 process.env.APP_STORE_CONNECT_KEY_ID && 
                                 process.env.APP_STORE_CONNECT_PRIVATE_KEY);
            
            if (useNewAPI) {
                // 新 API：只需要 transactionId
                if (!transactionId) {
                    return res.status(400).json({
                        success: false,
                        error: 'iOS 平台缺少必要參數（使用 App Store Server API）',
                        missingParams: ['transactionId'],
                    });
                }
            } else {
                // 舊 API：需要 receiptData 和 transactionId
                if (!receiptData || !transactionId) {
                    const missing = [];
                    if (!receiptData) missing.push('receiptData');
                    if (!transactionId) missing.push('transactionId');

                    return res.status(400).json({
                        success: false,
                        error: 'iOS 平台缺少必要參數（使用舊的 Receipt Validation API）',
                        missingParams: missing,
                    });
                }
            }
        }

        // 檢查玩家是否存在
        const player = await prisma.player.findUnique({
            where: { id: playerId },
        });

        if (!player) {
            return res.status(404).json({
                success: false,
                error: '玩家不存在',
                playerId: playerId,
            });
        }

        // 檢查商品是否有效
        const cardAmount = PRODUCT_CARD_AMOUNTS[productId];
        if (!cardAmount) {
            return res.status(400).json({
                success: false,
                error: '無效的商品 ID',
                productId: productId,
                validProductIds: Object.keys(PRODUCT_CARD_AMOUNTS),
            });
        }

        // 準備購買資料
        const purchaseData = platform === 'android'
            ? { productId, purchaseToken }
            // iOS 需要 transactionId（新 API）以及 receiptData（舊 API 備用）
            : { transactionId, receiptData };

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

        // 🧪 測試模式：跳過收據驗證（用於開發測試）
        // ⚠️ 重要：生產環境中應該關閉測試模式，使用真實驗證
        // 如果 IAP_TEST_MODE 未設定或為 'false'，則使用真實驗證
        const testMode = process.env.IAP_TEST_MODE === 'true';
        const isProduction = process.env.NODE_ENV === 'production';
        
        // 在生產環境中，如果啟用了測試模式，記錄警告但不拒絕（允許 Google Play 測試購買）
        // 但建議在 Render.com 環境變數中將 IAP_TEST_MODE 設為 'false' 或刪除該變數
        if (testMode && isProduction) {
            console.warn('⚠️ 警告：生產環境中啟用了 IAP_TEST_MODE（僅用於測試）');
            console.warn('   建議在 Render.com 環境變數中將 IAP_TEST_MODE 設為 "false" 或刪除該變數');
        }

        let verificationResult;

        if (testMode) {
            console.log('⚠️ IAP 測試模式：跳過收據驗證（僅用於開發測試）');
            // 測試模式：直接通過驗證
            verificationResult = {
                valid: true,
                productId: productId,
                transactionId: uniqueId,
                testMode: true,
            };
        } else {
            // 正式模式：驗證收據
            console.log(`🔍 開始驗證 ${platform.toUpperCase()} 購買收據...`);
            verificationResult = await iapVerification.verifyPurchase(platform, purchaseData);

            if (!verificationResult.valid) {
                console.error(`❌ 收據驗證失敗: ${verificationResult.error}`);
                return res.status(400).json({
                    success: false,
                    error: '收據驗證失敗',
                    details: verificationResult.error,
                    status: verificationResult.status,
                });
            }

            // 🔒 驗證 productId 是否匹配（防止收據偽造）
        if (verificationResult.productId) {
                const requestedCanonical = PRODUCT_ALIAS_CANONICAL[productId] || productId;
                const verifiedCanonical = PRODUCT_ALIAS_CANONICAL[verificationResult.productId] || verificationResult.productId;
                if (requestedCanonical !== verifiedCanonical) {
                    console.error(`❌ 商品 ID 不匹配：請求 ${productId}，收據中 ${verificationResult.productId}`);
                    return res.status(400).json({
                        success: false,
                        error: '商品 ID 不匹配',
                        details: `請求的商品 ID (${productId}) 與收據中的商品 ID (${verificationResult.productId}) 不一致`,
                    });
                }
            }

            // 🔒 iOS：驗證 transactionId 是否匹配（防止重複使用收據）
            if (platform === 'ios' && verificationResult.transactionId) {
                if (verificationResult.transactionId !== transactionId) {
                    console.error(`❌ Transaction ID 不匹配：請求 ${transactionId}，收據中 ${verificationResult.transactionId}`);
                    return res.status(400).json({
                        success: false,
                        error: 'Transaction ID 不匹配',
                        details: `請求的 Transaction ID (${transactionId}) 與收據中的 Transaction ID (${verificationResult.transactionId}) 不一致`,
                    });
                }
                console.log(`✅ Transaction ID 驗證通過: ${transactionId}`);
            }

            console.log(`✅ 收據驗證成功：商品 ${verificationResult.productId || productId}`);
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
        // 🔧 重要：必須在交易成功後立即消耗，否則商品會被「卡住」
        if (platform === 'android') {
            const consumed = await iapVerification.consumePurchase(platform, purchaseData);
            if (!consumed) {
                console.error('⚠️ 警告：商品消耗失敗，但房卡已發放');
                // 即使消耗失敗，仍然返回成功（因為房卡已經發放）
                // Google Play 會在一段時間後自動重試消耗
            } else {
                console.log('✅ Google Play 商品已消耗');
            }
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
 * 只消耗購買（不發放房卡）
 * 用於處理已完成的購買但未消耗的情況
 * POST /api/iap/consume
 * 
 * Body:
 * {
 *   platform: 'android' | 'ios',
 *   productId: string,
 *   purchaseToken: string (Android)
 * }
 */
router.post('/consume', async (req, res) => {
    try {
        const { platform, productId, purchaseToken } = req.body;

        // 驗證必要參數
        if (!platform || !productId) {
            return res.status(400).json({
                success: false,
                error: '缺少必要參數',
            });
        }

        if (platform === 'android' && !purchaseToken) {
            return res.status(400).json({
                success: false,
                error: 'Android 平台缺少 purchaseToken',
            });
        }

        // 只消耗購買，不發放房卡
        if (platform === 'android') {
            const purchaseData = {
                productId: productId,
                purchaseToken: purchaseToken,
            };
            
            const consumed = await iapVerification.consumePurchase(platform, purchaseData);
            if (!consumed) {
                return res.status(400).json({
                    success: false,
                    error: '消耗購買失敗',
                });
            }

            console.log(`✅ 已消耗購買: ${productId}（不發放房卡）`);
            res.json({
                success: true,
                message: '購買已消耗',
            });
        } else {
            // iOS 不需要消耗
            res.json({
                success: true,
                message: 'iOS 不需要消耗購買',
            });
        }
    } catch (error) {
        console.error('消耗購買失敗:', error);
        res.status(500).json({
            success: false,
            error: error.message || '消耗購買失敗',
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
