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

/** GET /api/admin/game-records/club/[id] — 單筆詳情（含完整 JSON） */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const row = await prisma.clubGameResult.findUnique({
      where: { id },
      include: {
        club: {
          select: { id: true, clubId: true, name: true, description: true },
        },
      },
    })

    if (!row) {
      return NextResponse.json(
        { success: false, error: '紀錄不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: row,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] game-records/club/[id] GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得詳情失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
