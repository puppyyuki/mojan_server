import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { agentLevelLabelZh } from '@/lib/agent-level-display'
import { serializeAgentClubBinding } from '@/lib/agent-club-binding-helpers'
import { formatTaipeiDate, formatTaipeiTime } from '@/lib/taipei-time'

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
            upstreamAgent: {
              select: {
                id: true,
                userId: true,
                nickname: true,
                agentApplications: {
                  where: { status: 'approved' },
                  orderBy: { reviewedAt: 'desc' },
                  take: 1,
                  select: { agentLevel: true },
                },
              },
            },
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

    const playerDbIds = applications.map((app) => app.player.id as string)
    const allBindings =
      playerDbIds.length > 0
        ? await prisma.agentClubBinding.findMany({
            where: { playerId: { in: playerDbIds } },
            include: {
              club: { select: { id: true, clubId: true, name: true } },
              upstreamAgent: {
                select: { id: true, userId: true, nickname: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          })
        : []
    const bindingsByPlayer = new Map<string, ReturnType<typeof serializeAgentClubBinding>[]>()
    for (const b of allBindings) {
      const list = bindingsByPlayer.get(b.playerId) ?? []
      list.push(serializeAgentClubBinding(b))
      bindingsByPlayer.set(b.playerId, list)
    }

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
        date: formatTaipeiDate(record.createdAt),
        time: formatTaipeiTime(record.createdAt),
        adminUsername: record.adminUser.username,
        amount: record.amount,
        previousCount: record.previousCount,
        newCount: record.newCount,
        createdAt: record.createdAt.toISOString(),
      }))

      const up = app.player.upstreamAgent
      const upstreamAgent = up
        ? (() => {
            const level = up.agentApplications[0]?.agentLevel ?? 'normal'
            return {
              playerDbId: up.id,
              userId: up.userId,
              nickname: up.nickname,
              agentLevel: level,
              agentLevelLabel: agentLevelLabelZh(level),
            }
          })()
        : null

      return {
        id: app.id,
        playerId: app.player.userId,
        playerDbId: app.player.id, // 用於補卡操作的玩家資料庫 ID
        playerName: app.player.nickname,
        upstreamAgent,
        clubBindings: bindingsByPlayer.get(app.player.id) ?? [],
        clubBindingCount: (bindingsByPlayer.get(app.player.id) ?? []).length,
        fullName: app.fullName,
        email: app.email,
        phone: app.phone,
        note: app.note,
        status: app.status,
        agentLevel: app.agentLevel || 'agent', // 代理層級（legacy）
        maxClubCreateCount: Math.max(Number(app.maxClubCreateCount ?? 1) || 1, 1),
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

