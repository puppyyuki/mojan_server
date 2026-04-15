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

        // 代理購卡使用 AgentRoomCardProduct，與大廳購卡分開
        const products = await prisma.agentRoomCardProduct.findMany({
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

        // 驗證產品是否存在（使用 AgentRoomCardProduct，與大廳購買分開）
        const product = await prisma.agentRoomCardProduct.findUnique({
            where: { id: productId },
        });

        if (!product || !product.isActive) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '產品不存在或已停用',
            });
        }

        // 檢查是否已有待付款訂單（僅限已成功取號/產生虛擬帳號的代理購買訂單）
        const pendingOrders = await prisma.roomCardOrder.findMany({
            where: {
                playerId: agentId,
                status: 'PENDING',
            },
            include: {
                product: {
                    select: {
                        isActive: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        const isAgentOrder = (order) => {
            const raw = order.raw;
            if (!raw || typeof raw !== 'object') {
                const hasInactiveProduct = order.product && order.product.isActive === false;
                return hasInactiveProduct;
            }
            if (raw.isAgentPurchase === true || raw.agentId === agentId || !!raw.agentProductId) {
                return true;
            }
            const hasInactiveProduct = order.product && order.product.isActive === false;
            return hasInactiveProduct;
        };

        const hasVirtualPaymentAccount = (order) => {
            if (order.virtualAccount && order.virtualAccount.trim() !== '') {
                return true;
            }
            const raw = order.raw;
            if (!raw || typeof raw !== 'object') {
                return false;
            }
            const rawAccount = raw.vAccount || raw.virtualAccount;
            return typeof rawAccount === 'string' && rawAccount.trim() !== '';
        };

        const pendingAgentOrders = pendingOrders.filter((order) => isAgentOrder(order));
        const validPendingOrder = pendingAgentOrders.find((order) => hasVirtualPaymentAccount(order));
        const stalePendingOrderIds = pendingAgentOrders
            .filter((order) => !hasVirtualPaymentAccount(order))
            .map((order) => order.id);

        // 兼容舊資料：舊流程可能在未取號前就誤標記為 PENDING，統一修正為 FAILED
        if (stalePendingOrderIds.length > 0) {
            await prisma.roomCardOrder.updateMany({
                where: {
                    id: { in: stalePendingOrderIds },
                },
                data: {
                    status: 'FAILED',
                },
            });
        }

        if (validPendingOrder) {
            const pendingCardAmount = validPendingOrder.cardAmount;
            const pendingBankCode = validPendingOrder.bankCode || '---';
            const pendingVirtualAccount = validPendingOrder.virtualAccount || '--------';

            setCorsHeaders(res);
            return res.status(409).json({
                success: false,
                error: '您目前有尚未付款的訂單，請先完成付款或聯繫客服協助取消',
                code: 'PENDING_ORDER_EXISTS',
                pendingOrder: {
                    id: validPendingOrder.id,
                    cardAmount: pendingCardAmount,
                    bankCode: pendingBankCode,
                    virtualAccount: pendingVirtualAccount,
                    message: `您目前有尚未付款的訂單\n${pendingCardAmount} 張\n付款帳號：(${pendingBankCode})${pendingVirtualAccount}\n如有問題請聯繫官方客服：@DJ5353`,
                },
            });
        }

        // 計算總金額（數量固定為 1，因為產品已經定義了 cardAmount）
        const cardAmount = product.cardAmount;
        const price = product.price;
        const description = `代理購買 ${cardAmount} 張房卡`;

        // 建立臨時訂單記錄（使用 RoomCardOrder，但標記為代理購買）
        const merchantTradeNo = ecpayLib.generateMerchantTradeNo();
        // 代理購買限制只能使用 ATM 轉帳
        const finalPaymentType = 'ATM';

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
        // 注意：RoomCardOrder 的 productId 必須是 RoomCardProduct 的 ID
        // 但我們使用 AgentRoomCardProduct，所以需要創建一個對應的 RoomCardProduct 記錄
        // 或者使用一個虛擬的 productId
        
        // 方案：為每個 AgentRoomCardProduct 創建一個對應的 RoomCardProduct 記錄
        // 使用相同的 cardAmount 和 price，但標記為代理專用
        // 或者使用一個特殊的標記產品 ID
        
        // 查找或創建對應的 RoomCardProduct（用於訂單記錄）
        // 使用 agentProductId 作為標記，確保不會與大廳購卡產品混淆
        let roomCardProduct = await prisma.roomCardProduct.findFirst({
            where: {
                cardAmount: cardAmount,
                price: price,
                // 可以添加一個標記來區分，但為了簡單，我們直接使用相同的 cardAmount 和 price
                // 因為代理購卡的價格和數量與大廳購卡不同，所以不會衝突
            },
        });
        
        // 如果沒有對應的 RoomCardProduct，創建一個（用於訂單記錄的外鍵約束）
        // 注意：這只是為了滿足外鍵約束，實際產品信息在 raw 中保存
        if (!roomCardProduct) {
            roomCardProduct = await prisma.roomCardProduct.create({
                data: {
                    cardAmount: cardAmount,
                    price: price,
                    isActive: false, // 標記為不活躍，因為這是代理專用產品
                },
            });
        }
        
        await prisma.roomCardOrder.create({
            data: {
                playerId: agentId, // 使用 agentId 作為 playerId
                productId: roomCardProduct.id, // 使用對應的 RoomCardProduct ID（滿足外鍵約束）
                merchantTradeNo,
                cardAmount,
                price,
                // 未取號前屬於失敗分類；待 PaymentInfoURL 成功回傳後才會更新為 PENDING
                status: 'FAILED',
                paymentType: finalPaymentType,
                raw: {
                    ...paymentData,
                    isAgentPurchase: true, // 標記為代理購買
                    agentId: agentId,
                    agentProductId: productId, // 保存真實的 AgentRoomCardProduct ID
                    waitingForPaymentInfo: true,
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
