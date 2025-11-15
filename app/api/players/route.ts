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
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      {
        success: true,
        data: players,
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
      // 如果已存在，返回現有玩家
      return NextResponse.json(
        {
          success: true,
          data: existingPlayer,
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

