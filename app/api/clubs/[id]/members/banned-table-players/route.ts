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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const playerId = body?.playerId
    const actorPlayerId = body?.actorPlayerId
    const bannedPlayerIds = Array.isArray(body?.bannedPlayerIds)
      ? body.bannedPlayerIds.filter((x: unknown) => typeof x === 'string')
      : []

    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供玩家ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findUnique({ where: { id } })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (club.creatorId === playerId) {
      return NextResponse.json(
        { success: false, error: '不可修改擁有者設定' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const member = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: id,
          playerId,
        },
      },
      select: { clubId: true, playerId: true },
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '玩家不是俱樂部成員' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const isOwner = club.creatorId === actorPlayerId
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      })

      const perms = actorMember?.coLeaderPermissions as Record<string, unknown> | null
      const canBanSameTable =
        actorMember?.role === 'CO_LEADER' && perms?.banSameTable === true

      if (!canBanSameTable) {
        return NextResponse.json(
          { success: false, error: '沒有權限' },
          { status: 403, headers: corsHeaders() }
        )
      }
    }

    const updated = await prisma.clubMember.update({
      where: {
        clubId_playerId: {
          clubId: id,
          playerId,
        },
      },
      data: {
        bannedTablePlayers: bannedPlayerIds,
      },
    })

    return NextResponse.json(
      { success: true, data: updated, message: '設定禁止同桌玩家成功' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('設定禁止同桌玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '設定禁止同桌失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
