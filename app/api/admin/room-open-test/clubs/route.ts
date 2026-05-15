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

/** 開房測試：俱樂部候選（輸入式下拉） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim().toLowerCase() ?? ''
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100))

    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        clubId: true,
        name: true,
        creator: { select: { nickname: true, userId: true } },
      },
      orderBy: [{ name: 'asc' }, { clubId: 'asc' }],
      take: 500,
    })

    const filtered = q
      ? clubs.filter((c) => {
          const name = (c.name || '').toLowerCase()
          const code = (c.clubId || '').toLowerCase()
          const id = c.id.toLowerCase()
          return name.includes(q) || code.includes(q) || id.includes(q)
        })
      : clubs

    const data = filtered.slice(0, limit).map((c) => ({
      id: c.id,
      clubId: c.clubId,
      name: c.name,
      displayLabel: `${c.name}（${c.clubId}）`,
    }))

    return NextResponse.json({ success: true, data }, { headers: corsHeaders() })
  } catch (error) {
    console.error('[room-open-test/clubs]', error)
    return NextResponse.json(
      { success: false, error: '無法載入俱樂部列表' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
