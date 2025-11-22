const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * 後台金流管理路由
 * 整合大廳 App Store 付款紀錄和綠界付款紀錄
 */

/**
 * 獲取所有付款紀錄（整合 IAP + 綠界）
 * GET /api/admin/payments
 * 
 * Query 參數:
 * - type: 'iap' | 'ecpay' | 'all' (預設: 'all')
 * - status: 'completed' | 'pending' | 'failed' | 'all' (預設: 'all')
 * - startDate: ISO 日期字串
 * - endDate: ISO 日期字串
 * - limit: 數量限制 (預設: 100)
 * - offset: 分頁偏移 (預設: 0)
 */
router.get('/payments', async (req, res) => {
    try {
        const {
            type = 'all',
            status = 'all',
            startDate,
            endDate,
            limit = 100,
            offset = 0,
        } = req.query;

        const payments = [];

        // 獲取 IAP 付款紀錄（App Store / Google Play）
        if (type === 'all' || type === 'iap') {
            const iapWhere = {};

            // 狀態篩選
            if (status !== 'all') {
                iapWhere.status = status;
            }

            // 日期篩選
            if (startDate || endDate) {
                iapWhere.createdAt = {};
                if (startDate) {
                    iapWhere.createdAt.gte = new Date(startDate);
                }
                if (endDate) {
                    iapWhere.createdAt.lte = new Date(endDate);
                }
            }

            const iapPurchases = await prisma.purchase.findMany({
                where: iapWhere,
                include: {
                    player: {
                        select: {
                            id: true,
                            userId: true,
                            nickname: true,
                            avatarUrl: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset),
            });

            // 轉換為統一格式
            iapPurchases.forEach(purchase => {
                payments.push({
                    id: purchase.id,
                    type: 'iap',
                    platform: purchase.platform, // 'android' | 'ios'
                    transactionId: purchase.transactionId,
                    productId: purchase.productId,
                    cardAmount: purchase.cardAmount,
                    price: null, // IAP 沒有存價格
                    status: purchase.status,
                    player: purchase.player,
                    createdAt: purchase.createdAt,
                    paidAt: purchase.createdAt, // IAP 創建即付款
                    raw: purchase.purchaseData,
                });
            });
        }

        // 獲取綠界付款紀錄
        if (type === 'all' || type === 'ecpay') {
            const ecpayWhere = {};

            // 狀態篩選（綠界狀態映射）
            if (status !== 'all') {
                const statusMap = {
                    'completed': 'PAID',
                    'pending': 'PENDING',
                    'failed': 'FAILED',
                };
                ecpayWhere.status = statusMap[status] || status.toUpperCase();
            }

            // 日期篩選
            if (startDate || endDate) {
                ecpayWhere.createdAt = {};
                if (startDate) {
                    ecpayWhere.createdAt.gte = new Date(startDate);
                }
                if (endDate) {
                    ecpayWhere.createdAt.lte = new Date(endDate);
                }
            }

            const ecpayOrders = await prisma.roomCardOrder.findMany({
                where: ecpayWhere,
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
                take: parseInt(limit),
                skip: parseInt(offset),
            });

            // 轉換為統一格式
            ecpayOrders.forEach(order => {
                payments.push({
                    id: order.id,
                    type: 'ecpay',
                    platform: 'web',
                    transactionId: order.merchantTradeNo,
                    ecpayTradeNo: order.ecpayTradeNo,
                    productId: order.productId,
                    cardAmount: order.cardAmount,
                    price: order.price,
                    status: order.status.toLowerCase(),
                    paymentType: order.paymentType,
                    virtualAccount: order.virtualAccount,
                    bankCode: order.bankCode,
                    expireDate: order.expireDate,
                    player: order.player,
                    createdAt: order.createdAt,
                    paidAt: order.paidAt,
                    raw: order.raw,
                });
            });
        }

        // 按時間排序
        payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 計算統計資訊
        const stats = {
            total: payments.length,
            iap: payments.filter(p => p.type === 'iap').length,
            ecpay: payments.filter(p => p.type === 'ecpay').length,
            completed: payments.filter(p => p.status === 'completed' || p.status === 'paid').length,
            pending: payments.filter(p => p.status === 'pending').length,
            failed: payments.filter(p => p.status === 'failed').length,
            totalRevenue: payments
                .filter(p => p.status === 'completed' || p.status === 'paid')
                .reduce((sum, p) => sum + (p.price || 0), 0),
        };

        res.json({
            success: true,
            data: payments,
            stats: stats,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: payments.length,
            },
        });
    } catch (error) {
        console.error('獲取付款紀錄失敗:', error);
        res.status(500).json({
            success: false,
            error: '獲取付款紀錄失敗',
            message: error.message,
        });
    }
});

/**
 * 獲取付款統計資訊
 * GET /api/admin/payments/stats
 * 
 * Query 參數:
 * - startDate: ISO 日期字串
 * - endDate: ISO 日期字串
 */
router.get('/payments/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) {
                dateFilter.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                dateFilter.createdAt.lte = new Date(endDate);
            }
        }

        // IAP 統計
        const iapStats = await prisma.purchase.aggregate({
            where: {
                ...dateFilter,
                status: 'completed',
            },
            _count: { id: true },
            _sum: { cardAmount: true },
        });

        const iapByPlatform = await prisma.purchase.groupBy({
            by: ['platform'],
            where: {
                ...dateFilter,
                status: 'completed',
            },
            _count: { id: true },
            _sum: { cardAmount: true },
        });

        // 綠界統計
        const ecpayStats = await prisma.roomCardOrder.aggregate({
            where: {
                ...dateFilter,
                status: 'PAID',
            },
            _count: { id: true },
            _sum: {
                cardAmount: true,
                price: true,
            },
        });

        const ecpayByPaymentType = await prisma.roomCardOrder.groupBy({
            by: ['paymentType'],
            where: {
                ...dateFilter,
                status: 'PAID',
            },
            _count: { id: true },
            _sum: {
                cardAmount: true,
                price: true,
            },
        });

        res.json({
            success: true,
            data: {
                iap: {
                    totalTransactions: iapStats._count.id || 0,
                    totalCards: iapStats._sum.cardAmount || 0,
                    byPlatform: iapByPlatform.map(item => ({
                        platform: item.platform,
                        transactions: item._count.id,
                        cards: item._sum.cardAmount,
                    })),
                },
                ecpay: {
                    totalTransactions: ecpayStats._count.id || 0,
                    totalCards: ecpayStats._sum.cardAmount || 0,
                    totalRevenue: ecpayStats._sum.price || 0,
                    byPaymentType: ecpayByPaymentType.map(item => ({
                        paymentType: item.paymentType,
                        transactions: item._count.id,
                        cards: item._sum.cardAmount,
                        revenue: item._sum.price,
                    })),
                },
                summary: {
                    totalTransactions: (iapStats._count.id || 0) + (ecpayStats._count.id || 0),
                    totalCards: (iapStats._sum.cardAmount || 0) + (ecpayStats._sum.cardAmount || 0),
                    totalRevenue: ecpayStats._sum.price || 0,
                },
            },
        });
    } catch (error) {
        console.error('獲取付款統計失敗:', error);
        res.status(500).json({
            success: false,
            error: '獲取付款統計失敗',
            message: error.message,
        });
    }
});

/**
 * 獲取單筆付款詳情
 * GET /api/admin/payments/:type/:id
 * 
 * 參數:
 * - type: 'iap' | 'ecpay'
 * - id: 付款 ID
 */
router.get('/payments/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;

        let payment = null;

        if (type === 'iap') {
            payment = await prisma.purchase.findUnique({
                where: { id },
                include: {
                    player: {
                        select: {
                            id: true,
                            userId: true,
                            nickname: true,
                            avatarUrl: true,
                            cardCount: true,
                        },
                    },
                },
            });

            if (payment) {
                payment = {
                    ...payment,
                    type: 'iap',
                };
            }
        } else if (type === 'ecpay') {
            payment = await prisma.roomCardOrder.findUnique({
                where: { id },
                include: {
                    player: {
                        select: {
                            id: true,
                            userId: true,
                            nickname: true,
                            avatarUrl: true,
                            cardCount: true,
                        },
                    },
                    product: true,
                },
            });

            if (payment) {
                payment = {
                    ...payment,
                    type: 'ecpay',
                };
            }
        } else {
            return res.status(400).json({
                success: false,
                error: '無效的付款類型',
            });
        }

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: '找不到付款紀錄',
            });
        }

        res.json({
            success: true,
            data: payment,
        });
    } catch (error) {
        console.error('獲取付款詳情失敗:', error);
        res.status(500).json({
            success: false,
            error: '獲取付款詳情失敗',
            message: error.message,
        });
    }
});

module.exports = router;
