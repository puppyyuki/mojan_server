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

// 獲取所有代理申請和已批准的代理
export async function GET(request: NextRequest) {
  try {
    const applications = await prisma.agentApplication.findMany({
      include: {
        player: {
          include: {
            cardRechargeRecords: {
              include: {
                adminUser: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
            agentSales: {
              where: {
                status: 'COMPLETED',
              },
              select: {
                cardAmount: true,
                createdAt: true,
              },
            },
          },
        },
        reviewer: true,
      },
      orderBy: { createdAt: 'desc' },
    }) as any

    // 格式化數據
    const agents = applications.map((app) => {
      // 計算總補卡數
      const totalRechargeAmount = app.player.cardRechargeRecords.reduce(
        (sum, record) => sum + record.amount,
        0
      )

      // 計算平均月售卡量
      let averageMonthlySales = 0
      if (app.status === 'approved' && app.reviewedAt) {
        // 計算從批准日期到現在的月數
        const approvedDate = new Date(app.reviewedAt)
        const now = new Date()
        const monthsDiff = (now.getFullYear() - approvedDate.getFullYear()) * 12 +
          (now.getMonth() - approvedDate.getMonth())

        // 至少算1個月
        const months = Math.max(monthsDiff, 1)

        // 計算總售卡數
        const totalSales = app.player.agentSales.reduce(
          (sum, sale) => sum + sale.cardAmount,
          0
        )

        // 計算平均月售卡量
        averageMonthlySales = totalSales / months
      }

      // 獲取最近的補卡紀錄
      const recentRechargeRecords = app.player.cardRechargeRecords.slice(0, 5).map((record) => ({
        id: record.id,
        date: record.createdAt.toISOString().split('T')[0],
        time: record.createdAt.toISOString().split('T')[1].split('.')[0],
        adminUsername: record.adminUser.username,
        amount: record.amount,
        previousCount: record.previousCount,
        newCount: record.newCount,
        createdAt: record.createdAt.toISOString(),
      }))

      return {
        id: app.id,
        playerId: app.player.userId,
        playerDbId: app.player.id, // 用於補卡操作的玩家資料庫 ID
        playerName: app.player.nickname,
        fullName: app.fullName,
        email: app.email,
        phone: app.phone,
        note: app.note,
        status: app.status,
        agentLevel: app.agentLevel || 'normal', // 代理層級
        roomCardBalance: app.player.cardCount,
        totalRechargeAmount,
        averageMonthlySales,
        recentRechargeRecords,
        lastLoginAt: app.player.lastLoginAt,
        createdAt: app.createdAt.toISOString(),
        reviewedAt: app.reviewedAt?.toISOString() || null,
        reviewedBy: app.reviewer?.username || null,
      }
    })

    return NextResponse.json(
      {
        success: true,
        data: agents,
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('獲取代理列表失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '獲取代理列表失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

