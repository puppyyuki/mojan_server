import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'

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

export async function GET(request: NextRequest) {
  try {
    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權' },
        { status: 401, headers: corsHeaders() }
      )
    }

    const url = new URL(request.url)
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const limitRaw = Number(url.searchParams.get('limit') ?? 200)
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200), 500)

    const clubs = await prisma.club.findMany({
      select: { id: true, clubId: true, name: true, branchRoomCardEnabled: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    const filtered = clubs.filter((c) => {
      if (!search) return true
      return (
        c.name.toLowerCase().includes(search) ||
        c.clubId.includes(search) ||
        c.id.toLowerCase().includes(search)
      )
    })

    return NextResponse.json(
      {
        success: true,
        data: filtered.slice(0, limit),
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('club-candidates GET failed:', error)
    return NextResponse.json(
      { success: false, error: '載入俱樂部清單失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
