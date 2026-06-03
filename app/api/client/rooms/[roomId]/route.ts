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
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params

    const room = await prisma.room.findUnique({
      where: { roomId },
      select: {
        roomId: true,
        clubId: true,
        creatorId: true,
        currentPlayers: true,
        maxPlayers: true,
        status: true,
        gameSettings: true,
        createdAt: true,
        updatedAt: true,
        club: { select: { clubId: true } },
      },
    })

    if (!room) {
      return NextResponse.json(
        { success: false, error: '房間不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...room,
          clubDisplayCode: room.club?.clubId ?? null,
          club: undefined,
        },
        message: '獲取房間資訊成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Client Rooms API] 獲取房間資訊失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取房間資訊失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params
    const room = await prisma.room.findUnique({
      where: { roomId },
      select: { id: true, roomId: true },
    })

    if (!room) {
      return NextResponse.json(
        {
          success: true,
          data: { roomId, deleted: false },
          message: '房間已不存在',
        },
        { headers: corsHeaders() }
      )
    }

    await prisma.room.delete({ where: { id: room.id } })

    return NextResponse.json(
      {
        success: true,
        data: { roomId: room.roomId, deleted: true },
        message: '房間已刪除',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Client Rooms API] 刪除房間失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除房間失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

