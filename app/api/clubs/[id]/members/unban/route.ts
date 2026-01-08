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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { playerId } = await request.json()
    if (!playerId) {
      return NextResponse.json(
        { success: false, error: '請提供玩家ID' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const member = await prisma.clubMember.update({
      where: { clubId_playerId: { clubId: id, playerId } },
      data: { isBanned: false },
    })
    return NextResponse.json({ success: true, data: member }, { headers: corsHeaders() })
  } catch (error) {
    console.error('解禁成員失敗:', error)
    return NextResponse.json(
      { success: false, error: '解禁成員失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
