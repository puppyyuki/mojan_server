import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取玩家的補卡紀錄
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 檢查玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 獲取補卡紀錄
    const records = await prisma.cardRechargeRecord.findMany({
      where: { playerId: id },
      include: {
        adminUser: {
          select: {
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        records: records.map((record) => ({
          id: record.id,
          date: record.createdAt.toISOString().split('T')[0],
          time: record.createdAt.toISOString().split('T')[1].split('.')[0],
          adminUsername: record.adminUser.username,
          amount: record.amount,
          previousCount: record.previousCount,
          newCount: record.newCount,
          createdAt: record.createdAt,
        })),
      },
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取補卡紀錄失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取補卡紀錄失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

