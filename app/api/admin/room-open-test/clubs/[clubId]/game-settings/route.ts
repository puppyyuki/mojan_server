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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params
    const club = await prisma.club.findFirst({
      where: { OR: [{ id: clubId }, { clubId }] },
      select: { id: true, clubId: true, name: true, gameSettings: true },
    })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    return NextResponse.json(
      {
        success: true,
        data: {
          clubInternalId: club.id,
          clubDisplayCode: club.clubId,
          clubName: club.name,
          gameSettings: club.gameSettings ?? null,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[room-open-test/game-settings]', error)
    return NextResponse.json(
      { success: false, error: '無法載入遊戲設定' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
