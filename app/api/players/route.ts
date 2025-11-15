import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueId } from '@/lib/utils'

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

// 獲取所有玩家
export async function GET(request: NextRequest) {
  try {
    const players = await prisma.player.findMany({
      include: {
        clubMembers: {
          include: {
            club: true,
          },
        },
        cardRechargeRecords: true,
        cardConsumptionRecords: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // 計算每個玩家的統計資訊
    const playersWithStats = players.map((player) => {
      // 計算總補卡數
      const totalRechargeAmount = player.cardRechargeRecords.reduce(
        (sum, record) => sum + record.amount,
        0
      )

      // 計算總消耗卡數
      const totalConsumptionAmount = player.cardConsumptionRecords.reduce(
        (sum, record) => sum + record.amount,
        0
      )

      // 計算平均月耗卡量（基於消耗紀錄）
      const playerCreatedAt = new Date(player.createdAt)
      const now = new Date()
      const monthsDiff = Math.max(
        1,
        Math.ceil(
          (now.getTime() - playerCreatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)
        )
      )
      const averageMonthlyConsumption =
        monthsDiff > 0 ? totalConsumptionAmount / monthsDiff : 0

      // 獲取目前加入的俱樂部
      const currentClubs = player.clubMembers.map((member) => ({
        id: member.club.id,
        clubId: member.club.clubId,
        name: member.club.name,
      }))

      return {
        id: player.id,
        userId: player.userId,
        nickname: player.nickname,
        cardCount: player.cardCount,
        bio: player.bio,
        lastLoginAt: player.lastLoginAt,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt,
        totalRechargeAmount,
        averageMonthlyRecharge: Math.round(averageMonthlyConsumption * 100) / 100,
        currentClubs,
      }
    })

    return NextResponse.json(
      {
        success: true,
        data: playersWithStats,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取玩家列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取玩家列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 創建玩家（通過暱稱）
export async function POST(request: NextRequest) {
  try {
    const { nickname } = await request.json()

    if (!nickname || !nickname.trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入暱稱' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 檢查暱稱是否已存在
    const existingPlayer = await prisma.player.findUnique({
      where: { nickname: nickname.trim() },
    })

    if (existingPlayer) {
      // 如果已存在，更新最後登入時間並返回現有玩家
      const updatedPlayer = await prisma.player.update({
        where: { id: existingPlayer.id },
        data: {
          lastLoginAt: new Date(),
        },
      })
      
      return NextResponse.json(
        {
          success: true,
          data: updatedPlayer,
          message: '使用現有玩家',
        },
        { headers: corsHeaders() }
      )
    }

    // 生成唯一的6位數字ID
    const userId = await generateUniqueId(async (id) => {
      const exists = await prisma.player.findUnique({
        where: { userId: id },
      })
      return !exists
    })

    // 創建新玩家
    const player = await prisma.player.create({
      data: {
        userId,
        nickname: nickname.trim(),
        cardCount: 0,
        lastLoginAt: new Date(), // 新玩家也記錄登入時間
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: player,
        message: '玩家創建成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('創建玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '創建玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

