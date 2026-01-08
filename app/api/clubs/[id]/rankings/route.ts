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
    // 找出該俱樂部的所有房間
    const rooms = await prisma.room.findMany({
      where: { clubId: id },
      select: { id: true },
    })
    const roomIds = rooms.map(r => r.id)
    if (roomIds.length === 0) {
      return NextResponse.json({ success: true, data: [] }, { headers: corsHeaders() })
    }
    // 聚合參與次數
    const counts = await prisma.roomParticipant.groupBy({
      by: ['playerId'],
      where: { roomId: { in: roomIds } },
      _count: { playerId: true },
    })
    // 拉取玩家資訊
    const playerIds = counts.map(c => c.playerId)
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, userId: true, nickname: true, avatarUrl: true },
    })
    const playerMap = new Map(players.map(p => [p.id, p]))
    const ranking = counts
      .map(c => ({
        player: playerMap.get(c.playerId),
        games: c._count.playerId,
      }))
      .filter(r => r.player)
      .sort((a, b) => b.games - a.games)
    return NextResponse.json({ success: true, data: ranking }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取排行榜失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取排行榜失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

