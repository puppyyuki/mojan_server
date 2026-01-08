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
    const club = await prisma.club.findUnique({
      where: { id },
      select: { gameSettings: true },
    })
    return NextResponse.json({ success: true, data: { game_settings: club?.gameSettings ?? null } }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取遊戲設定失敗:', error)
    return NextResponse.json({ success: false, error: '獲取遊戲設定失敗' }, { status: 500, headers: corsHeaders() })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const gameSettings = body.gameSettings
    const club = await prisma.club.update({
      where: { id },
      data: { gameSettings },
      select: { gameSettings: true },
    })
    return NextResponse.json({ success: true, data: { game_settings: club.gameSettings } }, { headers: corsHeaders() })
  } catch (error) {
    console.error('更新遊戲設定失敗:', error)
    return NextResponse.json({ success: false, error: '更新遊戲設定失敗' }, { status: 500, headers: corsHeaders() })
  }
}
