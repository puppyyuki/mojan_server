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

// 獲取房卡產品列表（公開 API，供商店頁面使用）
export async function GET(request: NextRequest) {
    try {
        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        })

        return NextResponse.json(
            {
                success: true,
                data: {
                    products: products,
                },
            },
            { headers: corsHeaders() }
        )
    } catch (error: any) {
        console.error('獲取房卡產品列表失敗:', error)
        return NextResponse.json(
            {
                success: false,
                error: '獲取房卡產品列表失敗',
                message: error.message || '未知錯誤',
            },
            { status: 500, headers: corsHeaders() }
        )
    }
}
