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

/** 俱樂部成員候選（房主／玩家選擇） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clubId: string }> }
) {
  try {
    const { clubId } = await params
    const { searchParams } = new URL(request.url)
    const excludeRaw = searchParams.get('excludePlayerIds')?.trim()
    const excludeSet = new Set(
      excludeRaw ? excludeRaw.split(',').map((s) => s.trim()).filter(Boolean) : []
    )

    const club = await prisma.club.findFirst({
      where: { OR: [{ id: clubId }, { clubId }] },
      select: { id: true },
    })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id, isBanned: false },
      include: {
        player: { select: { id: true, userId: true, nickname: true } },
      },
      orderBy: { joinedAt: 'asc' },
    })

    const data = members
      .filter((m) => m.player && !excludeSet.has(m.player.id))
      .map((m) => ({
        id: m.player.id,
        userId: m.player.userId,
        nickname: m.player.nickname,
        role: m.role,
      }))

    return NextResponse.json({ success: true, data }, { headers: corsHeaders() })
  } catch (error) {
    console.error('[room-open-test/members]', error)
    return NextResponse.json(
      { success: false, error: '無法載入俱樂部成員' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
