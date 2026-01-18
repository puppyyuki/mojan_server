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
    const url = new URL(request.url)
    const limitRaw = url.searchParams.get('limit')
    const parsed = limitRaw !== null ? Number(limitRaw) : NaN
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 200)
      : 50

    let club = await prisma.club.findUnique({ where: { id } })
    if (!club) {
      club = await prisma.club.findUnique({ where: { clubId: id } })
    }
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const rows = await prisma.clubActivity.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(
      { success: true, data: rows },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取俱樂部動態失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取俱樂部動態失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

