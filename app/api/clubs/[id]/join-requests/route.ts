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

// 列出俱樂部的加入申請
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'PENDING' // 預設只返回待審
    const where: any = { clubId: id }
    if (status && status !== 'ALL') {
      where.status = status
    }
    const requests = await prisma.clubJoinRequest.findMany({
      where,
      include: {
        player: {
          select: { id: true, userId: true, nickname: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ success: true, data: requests }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取加入申請失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取加入申請失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 送出加入申請
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
    const club = await prisma.club.findUnique({ where: { id } })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    const isMember = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId: id, playerId } },
    })
    if (isMember) {
      return NextResponse.json(
        { success: false, error: '已是俱樂部成員' },
        { status: 400, headers: corsHeaders() }
      )
    }
    // 檢查是否已有待審申請
    const existingPending = await prisma.clubJoinRequest.findFirst({
      where: { clubId: id, playerId, status: 'PENDING' },
    })
    if (existingPending) {
      return NextResponse.json(
        { success: false, error: '申請已在審核中' },
        { status: 400, headers: corsHeaders() }
      )
    }
    const req = await prisma.clubJoinRequest.create({
      data: { clubId: id, playerId, status: 'PENDING' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    })
    return NextResponse.json(
      { success: true, data: req, message: '加入申請已送出' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('送出加入申請失敗:', error)
    return NextResponse.json(
      { success: false, error: '送出加入申請失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
