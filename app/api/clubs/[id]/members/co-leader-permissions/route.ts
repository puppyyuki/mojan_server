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
    const playerId: unknown = body?.playerId
    const permissionsRaw: unknown = body?.permissions
    const actorPlayerId: unknown = body?.actorPlayerId

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

    const club = await prisma.club.findUnique({
      where: { id },
      select: { creatorId: true },
    })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (club.creatorId !== actorPlayerId) {
      return NextResponse.json(
        { success: false, error: '沒有權限' },
        { status: 403, headers: corsHeaders() }
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
      select: { clubId: true, playerId: true, role: true },
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '玩家不是俱樂部成員' },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (member.role !== 'CO_LEADER') {
      return NextResponse.json(
        { success: false, error: '僅可設定副會長權限' },
        { status: 400, headers: corsHeaders() }
      )
    }

    let normalized: Record<string, boolean> | null = null
    if (permissionsRaw && typeof permissionsRaw === 'object') {
      normalized = {}
      for (const [key, value] of Object.entries(permissionsRaw as Record<string, unknown>)) {
        normalized[key] = value === true
      }
      if (Object.keys(normalized).length === 0) {
        normalized = null
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
        coLeaderPermissions: normalized,
      },
    })

    return NextResponse.json(
      { success: true, data: updated, message: '設定副會長權限成功' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('設定副會長權限失敗:', error)
    return NextResponse.json(
      { success: false, error: '設定副會長權限失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
