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
    const actorPlayerId = url.searchParams.get('actorPlayerId')
    const status = url.searchParams.get('status') || 'PENDING' // 預設只返回待審

    if (!actorPlayerId || typeof actorPlayerId !== 'string') {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findUnique({
      where: { id },
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
        where: { clubId_playerId: { clubId: id, playerId: actorPlayerId } },
        select: { role: true, coLeaderPermissions: true },
      })

      const perms =
        actorMember?.coLeaderPermissions as Record<string, unknown> | null
      const canReview =
        actorMember?.role === 'CO_LEADER' && perms?.approveJoinRequests === true

      if (!canReview) {
        return NextResponse.json(
          { success: false, error: '沒有權限' },
          { status: 403, headers: corsHeaders() }
        )
      }
    }

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

    const joinedClubCount = await prisma.clubMember.count({
      where: { playerId },
    })
    const joinLimitRaw = Number(player.maxJoinClubCount)
    const joinLimit =
      Number.isFinite(joinLimitRaw) && joinLimitRaw >= 1
        ? Math.floor(joinLimitRaw)
        : 3
    if (joinedClubCount >= joinLimit) {
      return NextResponse.json(
        { success: false, error: `已達可加入俱樂部上限（${joinLimit}）` },
        { status: 400, headers: corsHeaders() }
      )
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } })
    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const requiresApproval = club.joinRequiresOwnerApproval !== false

    if (!requiresApproval) {
      await prisma.clubJoinRequest.updateMany({
        where: { clubId: id, playerId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })

      const member = await prisma.clubMember.create({
        data: { clubId: id, playerId },
        include: {
          player: {
            select: { id: true, userId: true, nickname: true, cardCount: true },
          },
        },
      })

      const nn = member.player?.nickname ?? player.nickname ?? null
      await prisma.clubActivity.create({
        data: {
          clubId: id,
          type: 'MEMBER_JOINED_DIRECT',
          actorPlayerId: playerId,
          targetPlayerId: playerId,
          actorNickname: nn,
          targetNickname: nn,
        },
      })

      return NextResponse.json(
        {
          success: true,
          data: { joinedDirectly: true, member },
          message: '已加入俱樂部',
        },
        { headers: corsHeaders() }
      )
    }

    const existingPending = await prisma.clubJoinRequest.findFirst({
      where: { clubId: id, playerId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        player: { select: { id: true, userId: true, nickname: true, avatarUrl: true } },
      },
    })
    if (existingPending) {
      return NextResponse.json(
        { success: true, data: existingPending, message: '加入申請已送出' },
        { headers: corsHeaders() }
      )
    }

    const req = await prisma.clubJoinRequest.create({
      data: { clubId: id, playerId, status: 'PENDING' },
      include: {
        player: {
          select: { id: true, userId: true, nickname: true, avatarUrl: true },
        },
      },
    })

    const nickname = req.player?.nickname ?? player.nickname ?? null

    await prisma.clubActivity.create({
      data: {
        clubId: id,
        type: 'JOIN_REQUESTED',
        actorPlayerId: playerId,
        targetPlayerId: playerId,
        actorNickname: nickname,
        targetNickname: nickname,
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
