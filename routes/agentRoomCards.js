const express = require('express');
const router = express.Router();

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
router.get('/room-cards/products', async (req, res) => {
    try {
        const { prisma } = req.app.locals;

        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        });

        console.log('[Agent Room Cards API] Found products:', products.length);

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
 * 代理商購買房卡
 */
router.post('/room-cards/buy', async (req, res) => {
    try {
        const { productId, quantity } = req.body;

        if (!productId || !quantity || quantity <= 0) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '參數錯誤',
            });
        }

        // TODO: 實現購買房卡邏輯
        // 這裡應該：
        // 1. 驗證代理身份
        // 2. 獲取產品信息
        // 3. 處理付款
        // 4. 增加代理的房卡數量

        console.log('[Agent Room Cards API] Buy request:', { productId, quantity });

        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            data: {
                transactionId: 'TXN' + Date.now().toString(),
                cardAmount: 0,
            },
            message: '購買成功',
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
