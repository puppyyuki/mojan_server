import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

function isAdminTestRoom(gameSettings: unknown): boolean {
  if (!gameSettings || typeof gameSettings !== 'object' || Array.isArray(gameSettings)) return false
  return (gameSettings as Record<string, unknown>).admin_open_test === true
}

/** 關閉（刪除）後台測試房 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params
    const room = await prisma.room.findFirst({
      where: { OR: [{ roomId }, { id: roomId }] },
    })

    if (!room) {
      return NextResponse.json(
        { success: true, data: { deleted: false }, message: '房間已不存在' },
        { headers: corsHeaders() }
      )
    }

    if (!isAdminTestRoom(room.gameSettings)) {
      return NextResponse.json(
        { success: false, error: '僅可關閉後台開房測試建立的房間' },
        { status: 403, headers: corsHeaders() }
      )
    }

    await prisma.room.delete({ where: { id: room.id } })

    return NextResponse.json(
      { success: true, data: { roomId: room.roomId, deleted: true }, message: '房間已關閉' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[room-open-test/rooms DELETE]', error)
    return NextResponse.json(
      { success: false, error: '關閉房間失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
