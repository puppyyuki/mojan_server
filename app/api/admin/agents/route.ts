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
          },
        },
        reviewer: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // 格式化數據
    const agents = applications.map((app) => {
      // 計算總補卡數
      const totalRechargeAmount = app.player.cardRechargeRecords.reduce(
        (sum, record) => sum + record.amount,
        0
      )

      // 計算平均月售卡量（暫時留空，返回 0）
      const averageMonthlySales = 0

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

