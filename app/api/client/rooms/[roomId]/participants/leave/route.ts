import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

async function resolvePlayerId(playerId: string): Promise<string | null> {
  const direct = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true },
  })
  if (direct) return direct.id

  const byUserId = await prisma.player.findUnique({
    where: { userId: playerId },
    select: { id: true },
  })
  return byUserId?.id ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params
    const body = await request.json().catch(() => ({}))
    const rawPlayerId = body?.playerId?.toString?.().trim?.() ?? ''
    if (!rawPlayerId) {
      return NextResponse.json(
        { success: false, error: '缺少玩家 ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true },
    })
    if (!room) {
      return NextResponse.json(
        {
          success: true,
          data: { roomId, playerId: rawPlayerId, currentPlayers: 0 },
          message: '房間已不存在',
        },
        { headers: corsHeaders() }
      )
    }

    const playerId = await resolvePlayerId(rawPlayerId)
    if (!playerId) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.roomParticipant.updateMany({
        where: { roomId: room.id, playerId, leftAt: null },
        data: { leftAt: now },
      })

      const currentPlayers = await tx.roomParticipant.count({
        where: { roomId: room.id, leftAt: null },
      })
      await tx.room.update({
        where: { id: room.id },
        data: { currentPlayers },
      })
      return { currentPlayers }
    })

    return NextResponse.json(
      {
        success: true,
        data: { roomId: room.roomId, playerId, currentPlayers: result.currentPlayers },
        message: '玩家已離開房間',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Client Rooms Participants Leave API] 同步離開失敗:', error)
    return NextResponse.json(
      { success: false, error: '同步離開失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
