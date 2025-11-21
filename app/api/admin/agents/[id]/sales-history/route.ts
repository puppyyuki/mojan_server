import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取代理的售卡紀錄
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        // 查找申請
        const application = await prisma.agentApplication.findUnique({
            where: { id },
            include: {
                player: {
                    include: {
                        agentSales: {
                            include: {
                                buyer: {
                                    select: {
                                        userId: true,
                                        nickname: true,
                                    },
                                },
                            },
                            orderBy: {
                                createdAt: 'desc',
                            },
                        },
                    },
                },
            },
        }) as any

        if (!application) {
            return NextResponse.json(
                { success: false, error: '代理申請不存在' },
                { status: 404, headers: corsHeaders() }
            )
        }

        // 格式化售卡紀錄
        const records = application.player.agentSales.map((sale: any) => ({
            id: sale.id,
            date: sale.createdAt.toISOString().split('T')[0],
            time: sale.createdAt.toISOString().split('T')[1].split('.')[0],
            buyerUserId: sale.buyer.userId,
            buyerName: sale.buyer.nickname,
            cardAmount: sale.cardAmount,
            status: sale.status,
            createdAt: sale.createdAt.toISOString(),
        }))

        return NextResponse.json(
            {
                success: true,
                data: {
                    records,
                },
            },
            { headers: corsHeaders() }
        )
    } catch (error: any) {
        console.error('獲取售卡紀錄失敗:', error)
        return NextResponse.json(
            {
                success: false,
                error: '獲取售卡紀錄失敗',
                message: error.message || '未知錯誤',
            },
            { status: 500, headers: corsHeaders() }
        )
    }
}
