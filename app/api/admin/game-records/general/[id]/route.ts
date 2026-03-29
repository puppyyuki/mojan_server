import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

/** GET /api/admin/game-records/general/[id] — 單筆詳情（含各局 shareCode，不含完整 events） */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const row = await prisma.v2MatchSession.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            player: {
              select: { id: true, userId: true, nickname: true, avatarUrl: true },
            },
          },
        },
        rounds: {
          select: {
            id: true,
            roundIndex: true,
            endedAt: true,
            shareCode: true,
            shareCodeAllocatedByPlayerId: true,
          },
          orderBy: { roundIndex: 'asc' },
        },
      },
    })

    if (!row) {
      return NextResponse.json(
        { success: false, error: '紀錄不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: row,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] game-records/general/[id] GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得詳情失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
