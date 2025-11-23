const express = require('express');
const router = express.Router();

// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * GET /api/room-cards/products
 * 獲取房卡產品列表（公開 API，供商店頁面使用）
 */
router.get('/products', async (req, res) => {
    try {
        const { prisma } = req.app.locals;

        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        });

        console.log('[Room Cards API] Found products:', products.length);

        // 為每個商品添加 productCode（用於 IAP 商品 ID）
        // 格式：room_card_{cardAmount}
        const productsWithCode = products.map(product => ({
            ...product,
            productCode: `room_card_${product.cardAmount}`,
        }));

        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            data: {
                products: productsWithCode,
            },
        });
    } catch (error) {
        console.error('[Room Cards API] 獲取房卡產品列表失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '獲取房卡產品列表失敗',
            message: error.message || '未知錯誤',
        });
    }
});

module.exports = router;
