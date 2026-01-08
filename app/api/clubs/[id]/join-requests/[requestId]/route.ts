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

async function getParams(params: Promise<{ id: string; requestId: string }>) {
  const { id, requestId } = await params
  return { clubId: id, requestId }
}

// 批准申請
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get('action') // approve | reject | cancel
    const { clubId, requestId } = await getParams(params)
    const req = await prisma.clubJoinRequest.findUnique({ where: { id: requestId } })
    if (!req || req.clubId !== clubId) {
      return NextResponse.json(
        { success: false, error: '申請不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    if (action === 'approve') {
      // 變更申請狀態並加入成員
      await prisma.clubJoinRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED' },
      })
      // 若已是成員則略過
      const existing = await prisma.clubMember.findUnique({
        where: { clubId_playerId: { clubId, playerId: req.playerId } },
      })
      if (!existing) {
        await prisma.clubMember.create({
          data: { clubId, playerId: req.playerId, role: 'MEMBER' },
        })
      }
      return NextResponse.json(
        { success: true, message: '已批准加入申請' },
        { headers: corsHeaders() }
      )
    } else if (action === 'reject') {
      await prisma.clubJoinRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      })
      return NextResponse.json(
        { success: true, message: '已拒絕加入申請' },
        { headers: corsHeaders() }
      )
    } else if (action === 'cancel') {
      await prisma.clubJoinRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      })
      return NextResponse.json(
        { success: true, message: '已取消加入申請' },
        { headers: corsHeaders() }
      )
    }
    return NextResponse.json(
      { success: false, error: '未知動作' },
      { status: 400, headers: corsHeaders() }
    )
  } catch (error) {
    console.error('處理加入申請失敗:', error)
    return NextResponse.json(
      { success: false, error: '處理加入申請失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
