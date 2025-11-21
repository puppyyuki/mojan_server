const express = require('express');
const router = express.Router();

// 引入綠界相關函數
const ecpayLib = require('../lib/ecpay.js');

// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * GET /api/agents/room-cards/products
 * 獲取房卡產品列表（代理商用）
 */
router.get('/products', async (req, res) => {
    try {
        console.log('[Agent Room Cards API] GET /room-cards/products called');
        const { prisma } = req.app.locals;

        console.log('[Agent Room Cards API] Prisma client:', !!prisma);

        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        });

        console.log('[Agent Room Cards API] Found products:', products.length);
        console.log('[Agent Room Cards API] Products:', JSON.stringify(products, null, 2));

        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            data: {
                products: products,
            },
        });
    } catch (error) {
        console.error('[Agent Room Cards API] 獲取房卡產品列表失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '獲取房卡產品列表失敗',
            message: error.message || '未知錯誤',
        });
    }
});

/**
 * POST /api/agents/room-cards/buy
 * 代理商購買房卡（串接綠界金流）
 */
router.post('/buy', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { productId, agentId, paymentType } = req.body;

        console.log('[Agent Room Cards API] Buy request:', { productId, agentId, paymentType });

        // 驗證必要參數
        if (!productId || !agentId) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '缺少必要參數',
            });
        }

        // 驗證代理身份
        const agent = await prisma.player.findUnique({
            where: { id: agentId },
        });

        if (!agent) {
            setCorsHeaders(res);
            return res.status(404).json({
                success: false,
                error: '代理不存在',
            });
        }

        // 驗證產品是否存在（使用 RoomCardProduct，與大廳購買一致）
        const product = await prisma.roomCardProduct.findUnique({
            where: { id: productId },
        });

        if (!product || !product.isActive) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '產品不存在或已停用',
            });
        }

        // 計算總金額（數量固定為 1，因為產品已經定義了 cardAmount）
        const cardAmount = product.cardAmount;
        const price = product.price;
        const description = `代理購買 ${cardAmount} 張房卡`;

        // 建立臨時訂單記錄（使用 RoomCardOrder，但標記為代理購買）
        const merchantTradeNo = ecpayLib.generateMerchantTradeNo();
        const finalPaymentType = paymentType || 'ALL';

        // 建立綠界付款資料
        const paymentData = ecpayLib.createEcpayPaymentData(
            price,
            description,
            finalPaymentType,
            merchantTradeNo,
            {
                productId,
                cardAmount,
                price,
                agentId,
                description,
                isAgentPurchase: true, // 標記為代理購買
            }
        );

        // 建立訂單記錄（使用 RoomCardOrder，在 raw 中標記為代理購買）
        await prisma.roomCardOrder.create({
            data: {
                playerId: agentId, // 使用 agentId 作為 playerId
                productId,
                merchantTradeNo,
                cardAmount,
                price,
                status: 'PENDING',
                paymentType: finalPaymentType,
                raw: {
                    ...paymentData,
                    isAgentPurchase: true, // 標記為代理購買
                    agentId: agentId,
                },
            },
        });

        // 建立支付表單 HTML
        const paymentFormHtml = ecpayLib.createEcpayPaymentForm(
            price,
            description,
            finalPaymentType,
            paymentData
        );

        console.log('[Agent Room Cards API] 支付表單建立成功:', merchantTradeNo);

        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            paymentData,
            paymentFormHtml,
            paymentUrl: ecpayLib.getEcpayPaymentUrl(),
            merchantTradeNo,
            message: '支付表單建立成功',
        });
    } catch (error) {
        console.error('[Agent Room Cards API] 購買房卡失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '購買房卡失敗',
            message: error.message || '未知錯誤',
        });
    }
});

module.exports = router;
