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
    const rooms = await prisma.room.findMany({
      where: { clubId: id, status: 'FINISHED' },
      orderBy: { updatedAt: 'desc' },
    })
    const roomIds = rooms.map(r => r.id)
    const participants = await prisma.roomParticipant.findMany({
      where: { roomId: { in: roomIds } },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    })
    const grouped = rooms.map(room => ({
      room,
      participants: participants.filter(p => p.roomId === room.id),
    }))
    return NextResponse.json({ success: true, data: grouped }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取戰績失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取戰績失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

