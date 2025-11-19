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

// 獲取房卡訂單列表（後台用）
export async function GET(request: NextRequest) {
  try {
    const orders = await prisma.roomCardOrder.findMany({
      include: {
        player: {
          select: {
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
    })

    return NextResponse.json(
      {
        success: true,
        data: orders,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取訂單列表失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '獲取訂單列表失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

