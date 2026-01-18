import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const club = await prisma.club.findUnique({
      where: { id },
      select: { gameSettings: true },
    })
    return NextResponse.json({ success: true, data: { game_settings: club?.gameSettings ?? null } }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取遊戲設定失敗:', error)
    return NextResponse.json({ success: false, error: '獲取遊戲設定失敗' }, { status: 500, headers: corsHeaders() })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const gameSettings = body.gameSettings
    const actorPlayerId: unknown = body?.actorPlayerId

    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const clubRow = await prisma.club.findUnique({
      where: { id },
      select: { creatorId: true },
    })

    if (!clubRow) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const isOwner = clubRow.creatorId === actorPlayerId
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      })

      const perms = actorMember?.coLeaderPermissions as Record<string, unknown> | null
      const canModify =
        actorMember?.role === 'CO_LEADER' && perms?.modifyClubRules === true

      if (!canModify) {
        return NextResponse.json(
          { success: false, error: '沒有權限' },
          { status: 403, headers: corsHeaders() }
        )
      }
    }

    const club = await prisma.club.update({
      where: { id },
      data: { gameSettings },
      select: { gameSettings: true },
    })
    return NextResponse.json({ success: true, data: { game_settings: club.gameSettings } }, { headers: corsHeaders() })
  } catch (error) {
    console.error('更新遊戲設定失敗:', error)
    return NextResponse.json({ success: false, error: '更新遊戲設定失敗' }, { status: 500, headers: corsHeaders() })
  }
}
