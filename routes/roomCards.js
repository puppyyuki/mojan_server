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

        // 🔍 詳細診斷：檢查資料庫狀態
        const allProducts = await prisma.roomCardProduct.findMany({
            orderBy: { cardAmount: 'asc' },
        });
        console.log('[Room Cards API] 資料庫中總商品數（包含停用）:', allProducts.length);
        
        if (allProducts.length === 0) {
            console.log('[Room Cards API] ⚠️ 警告：資料庫中沒有任何 RoomCardProduct 記錄！');
            console.log('[Room Cards API] 💡 請執行腳本建立商品：node scripts/create-room-card-products.js');
        } else {
            console.log('[Room Cards API] 商品詳情：');
            allProducts.forEach(p => {
                console.log(`   - ${p.cardAmount} 張房卡, NT$ ${p.price}, isActive: ${p.isActive}`);
            });
        }

        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        });

        console.log('[Room Cards API] 啟用的商品數:', products.length);

        // 為每個商品添加 productCode（用於 IAP 商品 ID）
        // 注意：這是 Purchase Option ID，不是 Product ID
        // Google Play Console 中：
        // - Product ID: room_card_20_v2
        // - Purchase Option ID: room-card-20-buy (使用連字號，符合 Google Play 要求)
        const productsWithCode = products.map(product => {
            let productCode;
            if (product.cardAmount === 20) {
                // 20 張房卡使用新的 Purchase Option ID
                productCode = 'room-card-20-buy';
            } else {
                // 其他商品使用連字號格式
                productCode = `room-card-${product.cardAmount}-buy`.toLowerCase();
            }
            return {
                ...product,
                productCode: productCode,
            };
        });
        
        console.log('[Room Cards API] Products with productCode:', productsWithCode.map(p => ({
            id: p.id,
            cardAmount: p.cardAmount,
            productCode: p.productCode
        })));

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
