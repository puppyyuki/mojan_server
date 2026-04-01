import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { formatTaipeiDate, formatTaipeiTime } from '@/lib/taipei-time'

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
    const agentSales = await prisma.agentRoomCardSale.findMany({
      where: {
        buyerId: id,
        status: 'COMPLETED',
      },
      include: {
        agent: {
          select: {
            userId: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const merged = [
      ...records.map((record) => ({
        id: record.id,
        sourceType: 'ADMIN_RECHARGE',
        date: formatTaipeiDate(record.createdAt),
        time: formatTaipeiTime(record.createdAt),
        actorName: record.adminUser.username,
        actorUserId: record.adminUserId,
        amount: record.amount,
        previousCount: record.previousCount,
        newCount: record.newCount,
        note: record.note ?? '',
        createdAt: record.createdAt,
      })),
      ...agentSales.map((record) => ({
        id: record.id,
        sourceType: 'AGENT_SALE',
        date: formatTaipeiDate(record.createdAt),
        time: formatTaipeiTime(record.createdAt),
        actorName: record.agent.nickname,
        actorUserId: record.agent.userId,
        amount: record.cardAmount,
        previousCount: null as number | null,
        newCount: null as number | null,
        note: '代理售卡給玩家',
        createdAt: record.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return NextResponse.json({
      success: true,
      data: {
        records: merged,
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

