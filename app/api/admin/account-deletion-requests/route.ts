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

/** 後台：列出所有帳號刪除申請（含申請時間、狀態） */
export async function GET(_request: NextRequest) {
  try {
    const rows = await prisma.accountDeletionRequest.findMany({
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = rows.map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerUserId: r.player.userId,
      playerNickname: r.player.nickname,
      submittedNickname: r.submittedNickname,
      submittedUserId: r.submittedUserId,
      reason: r.reason,
      status: r.status,
      statusLabel: r.status === 'PENDING' ? '申請中' : '已撤銷',
      createdAt: r.createdAt,
      scheduledDeletionAt: r.scheduledDeletionAt,
      revokedAt: r.revokedAt,
    }))

    return NextResponse.json(
      { success: true, data },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('admin account-deletion-requests GET:', error)
    return NextResponse.json(
      { success: false, error: '獲取帳號刪除申請失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
