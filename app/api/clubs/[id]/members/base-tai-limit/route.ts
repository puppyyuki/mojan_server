import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function parseNonNegativeIntOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.floor(Math.abs(parsed)))
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
    const body = await request.json().catch(() => null as any)
    const playerId: unknown = body?.playerId
    const basePointLimit: unknown = body?.basePointLimit
    const taiCountLimit: unknown = body?.taiCountLimit
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
    if (club.creatorId === playerId) {
      return NextResponse.json(
        { success: false, error: '不可修改擁有者設定' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const isOwner = club.creatorId === actorPlayerId
    if (!isOwner) {
      const actorMember = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId: id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      })

      const perms = actorMember?.coLeaderPermissions as Record<string, unknown> | null
      const canSetBaseTaiLimit =
        actorMember?.role === 'CO_LEADER' && perms?.setBaseTaiLimit === true

      if (!canSetBaseTaiLimit) {
        return NextResponse.json(
          { success: false, error: '沒有權限' },
          { status: 403, headers: corsHeaders() }
        )
      }
    }

    const member = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: id, playerId } },
      select: { clubId: true, playerId: true },
    })
    if (!member) {
      return NextResponse.json(
        { success: false, error: '玩家不是俱樂部成員' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const nextBasePointLimit = parseNonNegativeIntOrNull(basePointLimit)
    const nextTaiCountLimit = parseNonNegativeIntOrNull(taiCountLimit)
    const hasBaseInput =
      basePointLimit !== null &&
      basePointLimit !== undefined &&
      String(basePointLimit).trim() !== ''
    const hasTaiInput =
      taiCountLimit !== null &&
      taiCountLimit !== undefined &&
      String(taiCountLimit).trim() !== ''
    if (hasBaseInput && nextBasePointLimit === null) {
      return NextResponse.json(
        { success: false, error: '請輸入有效底分上限' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (hasTaiInput && nextTaiCountLimit === null) {
      return NextResponse.json(
        { success: false, error: '請輸入有效台數上限' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const updated = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: id, playerId } },
      data: {
        basePointLimit: nextBasePointLimit,
        taiCountLimit: nextTaiCountLimit,
      },
    })

    return NextResponse.json(
      { success: true, data: updated },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('設定底台上限失敗:', error)
    return NextResponse.json(
      { success: false, error: '設定底台上限失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
