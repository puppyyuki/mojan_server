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

        // 為每個商品添加 productId（Product ID）和 productCode（Purchase Option ID）
        // Google Play Console 三層結構：
        // - Product ID: room_card_20_v2 (定義「這是什麼商品」)
        // - Purchase Option ID: room-card-20-buy (定義「如何購買這個商品」，包含價格、地區等)
        // - Offer: 可選的折扣或預購優惠
        // 
        // 在應用程式中：
        // - 使用 Product ID 來識別商品（用於顯示、統計等）
        // - 使用 Purchase Option ID 來查詢和購買商品（Google Play Billing Library 需要）
        const productsWithCode = products.map(product => {
            let productId;  // Product ID (用於識別商品)
            let productCode; // Purchase Option ID (用於查詢和購買)
            
            if (product.cardAmount === 20) {
                productId = 'room_card_20_v2';
                productCode = 'room-card-20-buy';
            } else if (product.cardAmount === 50) {
                productId = 'room_card_50_v2';
                productCode = 'room-card-50-buy';
            } else if (product.cardAmount === 200) {
                productId = 'room_card_200_v2';
                productCode = 'room-card-200-buy';
            } else {
                // 其他商品使用預設格式
                productId = `room_card_${product.cardAmount}_v2`.toLowerCase();
                productCode = `room-card-${product.cardAmount}-buy`.toLowerCase();
            }
            
            return {
                ...product,
                productId: productId,      // Product ID (用於識別)
                productCode: productCode,  // Purchase Option ID (用於查詢和購買)
            };
        });
        
        console.log('[Room Cards API] Products with IDs:', productsWithCode.map(p => ({
            id: p.id,
            cardAmount: p.cardAmount,
            productId: p.productId,      // Product ID (用於識別)
            productCode: p.productCode  // Purchase Option ID (用於查詢和購買)
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
