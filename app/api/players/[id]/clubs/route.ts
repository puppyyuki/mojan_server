import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取玩家加入的俱樂部列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const player = await prisma.player.findUnique({
      where: { id },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const memberships = await prisma.clubMember.findMany({
      where: { playerId: id },
      include: {
        club: {
          include: {
            creator: {
              select: {
                id: true,
                userId: true,
                nickname: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    const clubs = memberships.map((membership) => membership.club)

    return NextResponse.json(
      {
        success: true,
        data: clubs,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取玩家俱樂部列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取玩家俱樂部列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

