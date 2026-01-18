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
    const body = await request
      .json()
      .catch(() => null as any)
    const actorPlayerId = body?.actorPlayerId as string | undefined
    const { clubId, requestId } = await getParams(params)
    const req = await prisma.clubJoinRequest.findUnique({ where: { id: requestId } })
    if (!req || req.clubId !== clubId) {
      return NextResponse.json(
        { success: false, error: '申請不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }
    if (action !== 'cancel') {
      if (!actorPlayerId || typeof actorPlayerId !== 'string') {
        return NextResponse.json(
          { success: false, error: '請提供操作者ID' },
          { status: 400, headers: corsHeaders() }
        )
      }

      const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { creatorId: true },
      })

      if (!club) {
        return NextResponse.json(
          { success: false, error: '俱樂部不存在' },
          { status: 404, headers: corsHeaders() }
        )
      }

      const isOwner = club.creatorId === actorPlayerId
      if (!isOwner) {
        const actorMember = await prisma.clubMember.findUnique({
          where: {
            clubId_playerId: { clubId: clubId, playerId: actorPlayerId },
          },
          select: { role: true, coLeaderPermissions: true },
        })

        const perms =
          actorMember?.coLeaderPermissions as Record<string, unknown> | null
        const canReview =
          actorMember?.role === 'CO_LEADER' &&
          perms?.approveJoinRequests === true

        if (!canReview) {
          return NextResponse.json(
            { success: false, error: '沒有權限' },
            { status: 403, headers: corsHeaders() }
          )
        }
      }
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

      const [actor, target] = await Promise.all([
        actorPlayerId
          ? prisma.player.findUnique({ where: { id: actorPlayerId } })
          : null,
        prisma.player.findUnique({ where: { id: req.playerId } }),
      ])

      await prisma.clubActivity.create({
        data: {
          clubId,
          type: 'JOIN_APPROVED',
          actorPlayerId: actorPlayerId ?? null,
          targetPlayerId: req.playerId,
          actorNickname: actor?.nickname ?? null,
          targetNickname: target?.nickname ?? null,
        },
      })
      return NextResponse.json(
        { success: true, message: '已批准加入申請' },
        { headers: corsHeaders() }
      )
    } else if (action === 'reject') {
      await prisma.clubJoinRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      })
      const [actor, target] = await Promise.all([
        actorPlayerId
          ? prisma.player.findUnique({ where: { id: actorPlayerId } })
          : null,
        prisma.player.findUnique({ where: { id: req.playerId } }),
      ])

      await prisma.clubActivity.create({
        data: {
          clubId,
          type: 'JOIN_REJECTED',
          actorPlayerId: actorPlayerId ?? null,
          targetPlayerId: req.playerId,
          actorNickname: actor?.nickname ?? null,
          targetNickname: target?.nickname ?? null,
        },
      })
      return NextResponse.json(
        { success: true, message: '已拒絕加入申請' },
        { headers: corsHeaders() }
      )
    } else if (action === 'cancel') {
      if (!actorPlayerId || typeof actorPlayerId !== 'string') {
        return NextResponse.json(
          { success: false, error: '請提供操作者ID' },
          { status: 400, headers: corsHeaders() }
        )
      }
      if (actorPlayerId !== req.playerId) {
        return NextResponse.json(
          { success: false, error: '沒有權限' },
          { status: 403, headers: corsHeaders() }
        )
      }
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
