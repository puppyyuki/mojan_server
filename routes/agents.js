const express = require('express');
const router = express.Router();

// CORS headers helper
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * POST /api/agents/apply
 * 提交代理申請
 */
router.post('/apply', async (req, res) => {
    try {
        const { fullName, email, phone, note, phoneOtpCode, emailOtpCode, playerId } = req.body;
        const { prisma } = req.app.locals;

        if (!fullName || !email || !phone || !playerId) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '缺少必填欄位',
            });
        }

        // 檢查玩家是否存在
        const player = await prisma.player.findUnique({
            where: { id: playerId },
        });

        if (!player) {
            setCorsHeaders(res);
            return res.status(404).json({
                success: false,
                error: '玩家不存在',
            });
        }

        // 檢查是否已有申請記錄（任何狀態）
        const existingApplication = await prisma.agentApplication.findFirst({
            where: {
                playerId: playerId,
            },
            orderBy: {
                createdAt: 'desc', // 獲取最新的申請記錄
            },
        });

        let application;

        if (existingApplication) {
            // 如果已有申請記錄
            if (existingApplication.status === 'pending') {
                // 已有待審核的申請，不允許重複提交
                setCorsHeaders(res);
                return res.status(400).json({
                    success: false,
                    error: '您已有待審核的申請',
                });
            } else if (existingApplication.status === 'approved') {
                // 已經是代理，不允許重新申請
                setCorsHeaders(res);
                return res.status(400).json({
                    success: false,
                    error: '您已經是代理，無需重新申請',
                });
            } else if (existingApplication.status === 'rejected') {
                // 被拒絕後重新提交，更新現有記錄
                application = await prisma.agentApplication.update({
                    where: { id: existingApplication.id },
                    data: {
                        fullName: fullName,
                        email: email,
                        phone: phone,
                        note: note || null,
                        phoneOtpCode: phoneOtpCode || '000000',
                        emailOtpCode: emailOtpCode || '000000',
                        status: 'pending', // 重新設置為待審核
                        reviewedAt: null, // 清除審核時間
                        reviewedBy: null, // 清除審核者
                    },
                });
            }
        } else {
            // 沒有申請記錄，創建新記錄
            application = await prisma.agentApplication.create({
                data: {
                    playerId: playerId,
                    fullName: fullName,
                    email: email,
                    phone: phone,
                    note: note || null,
                    phoneOtpCode: phoneOtpCode || '000000',
                    emailOtpCode: emailOtpCode || '000000',
                    status: 'pending',
                },
            });
        }

        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            data: {
                applicationId: application.id,
                message: '申請提交成功，請等待審核',
            },
        });
    } catch (error) {
        console.error('[Agents API] 提交代理申請失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '提交申請失敗',
            message: error.message || '未知錯誤',
        });
    }
});

/**
 * GET /api/agents/status
 * 檢查代理狀態
 */
router.get('/status', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        // 從查詢參數獲取玩家ID（userId，6位數字）或直接使用 playerId
        const playerId = req.query.playerId;
        const playerIdParam = req.query.playerIdParam; // 如果前端傳的是 playerId 參數

        const queryPlayerId = playerId || playerIdParam;

        if (!queryPlayerId) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: '缺少玩家ID',
            });
        }

        // 先嘗試用 userId 查找（6位數字）
        let approvedApplication = await prisma.agentApplication.findFirst({
            where: {
                player: {
                    userId: queryPlayerId,
                },
                status: 'approved', // 只查找已批准的申請
            },
            include: {
                player: true,
                reviewer: {
                    select: {
                        username: true,
                    },
                },
            },
            orderBy: {
                reviewedAt: 'desc', // 獲取最新的批准記錄
            },
        });

        // 如果沒找到，嘗試用 playerId (UUID) 查找
        if (!approvedApplication) {
            approvedApplication = await prisma.agentApplication.findFirst({
                where: {
                    playerId: queryPlayerId,
                    status: 'approved',
                },
                include: {
                    player: true,
                    reviewer: {
                        select: {
                            username: true,
                        },
                    },
                },
                orderBy: {
                    reviewedAt: 'desc',
                },
            });
        }

        if (approvedApplication) {
            // 玩家是已批准的代理
            setCorsHeaders(res);
            return res.status(200).json({
                success: true,
                data: {
                    isAgent: true,
                    agentRequestStatus: 'approved',
                    agentDetails: {
                        id: approvedApplication.id,
                        fullName: approvedApplication.fullName,
                        email: approvedApplication.email,
                        phone: approvedApplication.phone,
                        approvedAt: approvedApplication.reviewedAt?.toISOString() || null,
                        approvedBy: approvedApplication.reviewer?.username || null,
                    },
                },
            });
        } else {
            // 檢查是否有待審核或已拒絕的申請
            let pendingOrRejected = await prisma.agentApplication.findFirst({
                where: {
                    player: {
                        userId: queryPlayerId,
                    },
                    status: {
                        in: ['pending', 'rejected'],
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            // 如果沒找到，嘗試用 playerId (UUID) 查找
            if (!pendingOrRejected) {
                pendingOrRejected = await prisma.agentApplication.findFirst({
                    where: {
                        playerId: queryPlayerId,
                        status: {
                            in: ['pending', 'rejected'],
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                });
            }

            // 如果還是沒找到，嘗試直接查找玩家
            let player = null;
            if (!pendingOrRejected) {
                player = await prisma.player.findFirst({
                    where: {
                        OR: [
                            { userId: queryPlayerId },
                            { id: queryPlayerId },
                        ],
                    },
                    select: {
                        id: true,
                        userId: true,
                        nickname: true,
                        isAgent: true,
                        agentCardBalance: true,
                        cardCount: true,
                    },
                });
            }

            setCorsHeaders(res);
            return res.status(200).json({
                success: true,
                data: {
                    isAgent: player?.isAgent || false,
                    agentRequestStatus: pendingOrRejected?.status || null,
                    agentDetails: player?.isAgent ? {
                        userId: player.userId,
                        nickname: player.nickname,
                        agentCardBalance: player.agentCardBalance,
                        cardCount: player.cardCount,
                    } : null,
                },
            });
        }
    } catch (error) {
        console.error('[Agents API] 檢查代理狀態失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '檢查代理狀態失敗',
            message: error.message || '未知錯誤',
        });
    }
});

/**
 * GET /api/agents/home
 * 獲取代理首頁數據
 */
router.get('/home', async (req, res) => {
    try {
        // TODO: 實現獲取代理首頁數據邏輯
        setCorsHeaders(res);
        res.status(200).json({
            success: true,
            data: {
                totalSales: 0,
                totalRevenue: 0,
                currentMonthActivity: 0,
            },
        });
    } catch (error) {
        console.error('[Agents API] 獲取代理首頁數據失敗:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: '獲取代理首頁數據失敗',
            message: error.message || '未知錯誤',
        });
    }
});

/**
 * POST /api/agents/players/search
 * 搜索玩家（用於銷售房卡）
 */
router.post('/players/search', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { search } = req.body;
        console.log('[Agents API] [Player Search] Received search request:', { search });

        // For now, we'll search all players. In production, you'd want to verify agent status
        const players = await prisma.player.findMany({
            where: search ? {
                OR: [
                    { userId: { contains: search } },
                    { nickname: { contains: search } },
                ],
            } : {},
            select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
                cardCount: true,
            },
            take: 50,
        });

        console.log('[Agents API] [Player Search] Found players:', players.length);

        setCorsHeaders(res);
        res.json({
            success: true,
            data: {
                players: players.map(p => ({
                    playerId: p.id,
                    userId: p.userId,
                    displayName: p.nickname,
                    avatarUrl: p.avatarUrl,
                    cardCount: p.cardCount,
                })),
            },
        });
    } catch (error) {
        console.error('[Agents API] Error searching players:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: 'Failed to search players',
            message: error.message,
        });
    }
});

/**
 * POST /api/agents/sell-room-card
 * 銷售房卡給玩家
 */
router.post('/sell-room-card', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { playerId, cardAmount, agentId } = req.body;

        if (!playerId || !cardAmount || cardAmount <= 0 || !agentId) {
            setCorsHeaders(res);
            return res.status(400).json({
                success: false,
                error: 'Invalid request parameters',
            });
        }

        console.log(`[Agents API] [Sell Room Card] Agent: ${agentId}, Buyer: ${playerId}, Amount: ${cardAmount}`);

        // Start transaction
        const result = await prisma.$transaction(async (tx) => {
            // Get agent
            const agent = await tx.player.findUnique({
                where: { id: agentId },
            });

            if (!agent) {
                throw new Error('Agent not found');
            }

            console.log(`[Agents API] [Sell Room Card] Agent balance: ${agent.cardCount}, Requested: ${cardAmount}`);

            // Check agent has sufficient balance
            // User specified that agent balance IS the cardCount
            if (agent.cardCount < cardAmount) {
                throw new Error(`Insufficient card balance. Current: ${agent.cardCount}, Requested: ${cardAmount}`);
            }

            // Get buyer
            const buyer = await tx.player.findUnique({
                where: { id: playerId },
            });

            if (!buyer) {
                throw new Error('Player not found');
            }

            // Check if buyer is also an agent - prevent agent-to-agent sales for normal agents
            const buyerAgentApplication = await tx.agentApplication.findFirst({
                where: {
                    playerId: playerId,
                    status: 'approved', // Only check approved agents
                },
            });

            // Check if seller is a VIP agent (公關代理)
            const sellerAgentApplication = await tx.agentApplication.findFirst({
                where: {
                    playerId: agentId,
                    status: 'approved',
                },
            });

            // If buyer is an agent and seller is not a VIP agent, prevent the sale
            if (buyerAgentApplication && (!sellerAgentApplication || sellerAgentApplication.agentLevel !== 'vip')) {
                throw new Error('一般代理不能向其他代理出售房卡，只有公關代理可以售卡給代理');
            }

            // Deduct from agent and add to buyer
            await tx.player.update({
                where: { id: agentId },
                data: {
                    cardCount: { decrement: cardAmount },
                },
            });

            // Add to player balance
            await tx.player.update({
                where: { id: playerId },
                data: { cardCount: { increment: cardAmount } },
            });

            // Create sale record
            const sale = await tx.agentRoomCardSale.create({
                data: {
                    agentId,
                    buyerId: playerId,
                    cardAmount,
                    status: 'COMPLETED',
                },
            });

            return sale;
        });

        setCorsHeaders(res);
        res.json({
            success: true,
            data: { sale: result },
            message: `Successfully sold ${cardAmount} room cards`,
        });
    } catch (error) {
        console.error('[Agents API] Error selling room card:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to sell room card',
        });
    }
});

/**
 * POST /api/agents/sales-record
 * 獲取銷售記錄
 */
router.post('/sales-record', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { search, agentId } = req.body;

        // For now, use agentId from request body. In production, get from auth session
        const queryAgentId = agentId || 'agent-placeholder-id';

        const sales = await prisma.agentRoomCardSale.findMany({
            where: {
                agentId: queryAgentId,
                ...(search && {
                    buyer: {
                        OR: [
                            { userId: { contains: search } },
                            { nickname: { contains: search } },
                        ],
                    },
                }),
            },
            include: {
                buyer: {
                    select: {
                        userId: true,
                        nickname: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        // Group by buyer and calculate statistics
        const buyerStats = {};
        sales.forEach(sale => {
            const buyerId = sale.buyerId;
            if (!buyerStats[buyerId]) {
                buyerStats[buyerId] = {
                    displayName: sale.buyer.nickname,
                    userId: sale.buyer.userId,
                    lastCompletedAt: sale.createdAt.toISOString(),
                    lastCardAmount: sale.cardAmount,
                    buyTime: 0,
                    totalCardAmount: 0,
                };
            }
            buyerStats[buyerId].buyTime += 1;
            buyerStats[buyerId].totalCardAmount += sale.cardAmount;
        });

        const salesList = Object.values(buyerStats);

        setCorsHeaders(res);
        res.json({
            success: true,
            data: { sales: salesList },
        });
    } catch (error) {
        console.error('[Agents API] Error fetching sales records:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sales records',
        });
    }
});

/**
 * POST /api/agents/activity
 * 獲取玩家活動記錄
 */
router.post('/activity', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { search, agentId } = req.body;

        // For now, use agentId from request body. In production, get from auth session
        const queryAgentId = agentId || 'agent-placeholder-id';

        // Get all players who bought from this agent
        const sales = await prisma.agentRoomCardSale.findMany({
            where: {
                agentId: queryAgentId,
                ...(search && {
                    buyer: {
                        OR: [
                            { userId: { contains: search } },
                            { nickname: { contains: search } },
                        ],
                    },
                }),
            },
            include: {
                buyer: {
                    select: {
                        id: true,
                        userId: true,
                        nickname: true,
                        lastLoginAt: true,
                    },
                },
            },
            distinct: ['buyerId'],
        });

        // Calculate activity for each player
        const activities = sales.map(sale => ({
            userId: sale.buyer.userId,
            displayName: sale.buyer.nickname,
            lastOnline: sale.buyer.lastLoginAt?.toISOString() || null,
            totalActivityPlayer: 1, // Simplified - in production, calculate actual activity
        }));

        setCorsHeaders(res);
        res.json({
            success: true,
            data: { activities },
        });
    } catch (error) {
        console.error('[Agents API] Error fetching activity:', error);
        setCorsHeaders(res);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch activity records',
        });
    }
});

/**
 * GET /api/agents/payment-history
 * 獲取付款交易歷史（代理購買房卡的記錄）
 */
router.get('/payment-history', async (req, res) => {
    try {
        const { prisma } = req.app.locals;
        const { agentId } = req.query;

        // 驗證 agentId 是否提供
        if (!agentId) {
            console.error('[Agents API] payment-history: Missing agentId parameter');
            return res.status(400).json({
                success: false,
                error: '缺少 agentId 參數',
            });
        }

        console.log('[Agents API] payment-history: Fetching orders for agentId:', agentId);

        // 查詢所有訂單，然後過濾出代理購買的訂單
        // 因為 Prisma 的 JSON 查詢限制，我們需要先查詢所有訂單，然後在應用層過濾
        const allOrders = await prisma.roomCardOrder.findMany({
            where: {
                playerId: agentId, // 先過濾 playerId
            },
            include: {
                player: {
                    select: {
                        id: true,
                        userId: true,
                        nickname: true,
                        avatarUrl: true,
                    },
                },
                product: {
                    select: {
                        id: true,
                        cardAmount: true,
                        price: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 500, // 先取多一點，然後過濾
        });

        console.log('[Agents API] payment-history: Found', allOrders.length, 'total orders for playerId:', agentId);

        // 調試：打印前 3 個訂單的 raw 內容（用於排查）
        if (allOrders.length > 0) {
            console.log('[Agents API] payment-history: Sample raw data from first order:', 
                JSON.stringify(allOrders[0].raw, null, 2));
        }

        // 過濾出代理購買的訂單
        // 檢查條件（按優先級）：
        // 1. raw.isAgentPurchase === true（主要標記）
        // 2. raw.agentId 或 raw.agentProductId 存在（備用判斷）
        // 3. product.isActive === false（代理購買會創建 isActive: false 的產品）
        // 4. paymentType === 'ATM' 且訂單屬於該代理（代理購買只能使用 ATM）
        const orders = allOrders.filter(order => {
            try {
                const raw = order.raw;
                
                // 主要檢查：isAgentPurchase 標記
                let hasIsAgentPurchase = false;
                let hasAgentMarkers = false;
                
                if (raw && typeof raw === 'object') {
                    hasIsAgentPurchase = raw.isAgentPurchase === true;
                    hasAgentMarkers = raw.agentId || raw.agentProductId;
                }
                
                // 備用檢查 1：product.isActive === false（代理購買會創建 isActive: false 的產品）
                const hasInactiveProduct = order.product && order.product.isActive === false;
                
                // 備用檢查 2：paymentType === 'ATM'（代理購買只能使用 ATM）
                const hasAtmPayment = order.paymentType === 'ATM' || order.paymentType === 'ATM_LAND';
                
                // 如果訂單有 inactive product 或 ATM 付款，且屬於該代理，很可能是代理購買
                const likelyAgentPurchase = (hasInactiveProduct || hasAtmPayment) && order.playerId === agentId;
                
                const isAgentPurchase = hasIsAgentPurchase || hasAgentMarkers || likelyAgentPurchase;
                
                if (isAgentPurchase) {
                    console.log(`[Agents API] payment-history: Found agent purchase order: ${order.merchantTradeNo}`, {
                        hasIsAgentPurchase,
                        hasAgentMarkers,
                        hasInactiveProduct,
                        hasAtmPayment,
                        likelyAgentPurchase,
                        agentId: raw?.agentId,
                        agentProductId: raw?.agentProductId
                    });
                    
                    // 如果訂單被識別為代理購買但缺少標記，自動修復
                    if (!hasIsAgentPurchase) {
                        console.log(`[Agents API] payment-history: Auto-fixing order ${order.merchantTradeNo} - adding isAgentPurchase flag`);
                        // 異步修復訂單（不阻塞響應）
                        const currentRaw = raw || {};
                        prisma.roomCardOrder.update({
                            where: { id: order.id },
                            data: {
                                raw: {
                                    ...currentRaw,
                                    isAgentPurchase: true,
                                    agentId: agentId, // 確保 agentId 存在
                                    agentProductId: currentRaw.agentProductId || null,
                                },
                            },
                        }).catch(err => {
                            console.error(`[Agents API] payment-history: Failed to auto-fix order ${order.merchantTradeNo}:`, err);
                        });
                    }
                }
                
                return isAgentPurchase;
            } catch (e) {
                console.error('[Agents API] payment-history: Error filtering order:', e);
                return false;
            }
        }).slice(0, 100); // 限制為 100 筆

        console.log('[Agents API] payment-history: Filtered to', orders.length, 'agent purchase orders');

        res.json({
            success: true,
            data: {
                payments: orders.map(order => ({
                    id: order.id,
                    merchantTradeNo: order.merchantTradeNo,
                    ecpayTradeNo: order.ecpayTradeNo,
                    createdAt: order.createdAt.toISOString(),
                    cardAmount: order.cardAmount,
                    pricePaid: order.price,
                    status: order.status === 'PAID' ? 'COMPLETED' : order.status,
                    paymentType: order.paymentType,
                    virtualAccount: order.virtualAccount,
                    bankCode: order.bankCode,
                    expireDate: order.expireDate?.toISOString() || null,
                    paidAt: order.paidAt?.toISOString() || null,
                    player: order.player ? {
                        id: order.player.id,
                        userId: order.player.userId,
                        nickname: order.player.nickname,
                        avatarUrl: order.player.avatarUrl,
                    } : null,
                    product: order.product ? {
                        id: order.product.id,
                        cardAmount: order.product.cardAmount,
                        price: order.product.price,
                    } : null,
                })),
            },
        });
    } catch (error) {
        console.error('[Agents API] Error fetching payment history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch payment history',
            message: error.message || '未知錯誤',
        });
    }
});

module.exports = router;

