import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取俱樂部成員列表
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const club = await prisma.club.findUnique({
      where: { id },
    })

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const members = await prisma.clubMember.findMany({
      where: { clubId: id },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })

    return NextResponse.json(
      {
        success: true,
        data: members,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取成員列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取成員列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 添加成員到俱樂部
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

    // 檢查俱樂部是否存在
    const club = await prisma.club.findUnique({
      where: { id },
    })

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 檢查玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 檢查是否已經是成員
    const existingMember = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: id,
          playerId: playerId,
        },
      },
    })

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: '玩家已經是俱樂部成員' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 添加成員
    const member = await prisma.clubMember.create({
      data: {
        clubId: id,
        playerId: playerId,
      },
      include: {
        player: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            cardCount: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: member,
        message: '成員添加成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('添加成員失敗:', error)
    return NextResponse.json(
      { success: false, error: '添加成員失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 退出俱樂部（刪除成員）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')
    const action = searchParams.get('action')
    const actorPlayerId = searchParams.get('actorPlayerId')

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: '請提供玩家ID' },
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

    const resolvedAction = (action || '').toString().toLowerCase()
    const resolvedActorId =
      actorPlayerId && actorPlayerId.toString().trim()
        ? actorPlayerId.toString()
        : playerId.toString()

    const isKick =
      resolvedAction === 'kick' ||
      (resolvedActorId && resolvedActorId !== playerId.toString())

    if (resolvedAction === 'kick' && !actorPlayerId) {
      return NextResponse.json(
        { success: false, error: '請提供操作者ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (isKick) {
      if (club.creatorId === playerId.toString()) {
        return NextResponse.json(
          { success: false, error: '不可移除擁有者' },
          { status: 400, headers: corsHeaders() }
        )
      }

      const isOwner = club.creatorId === resolvedActorId
      if (!isOwner) {
        const actorMember = await prisma.clubMember.findUnique({
          where: {
            clubId_playerId: { clubId: id, playerId: resolvedActorId },
          },
          select: { role: true, coLeaderPermissions: true },
        })

        const perms =
          actorMember?.coLeaderPermissions as Record<string, unknown> | null
        const canKick =
          actorMember?.role === 'CO_LEADER' && perms?.kickMembers === true

        if (!canKick) {
          return NextResponse.json(
            { success: false, error: '沒有權限' },
            { status: 403, headers: corsHeaders() }
          )
        }
      }
    }

    // 檢查成員是否存在
    const member = await prisma.clubMember.findUnique({
      where: {
        clubId_playerId: {
          clubId: id,
          playerId: playerId,
        },
      },
    })

    if (!member) {
      return NextResponse.json(
        { success: false, error: '玩家不是俱樂部成員' },
        { status: 404, headers: corsHeaders() }
      )
    }

    await prisma.clubMember.delete({
      where: {
        clubId_playerId: {
          clubId: id,
          playerId: playerId,
        },
      },
    })

    const [actor, target] = await Promise.all([
      resolvedActorId
        ? prisma.player.findUnique({ where: { id: resolvedActorId } })
        : null,
      prisma.player.findUnique({ where: { id: playerId } }),
    ])

    await prisma.clubActivity.create({
      data: {
        clubId: id,
        type: isKick ? 'MEMBER_KICKED' : 'MEMBER_LEFT',
        actorPlayerId: resolvedActorId,
        targetPlayerId: playerId.toString(),
        actorNickname: actor?.nickname ?? null,
        targetNickname: target?.nickname ?? null,
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: '退出俱樂部成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('退出俱樂部失敗:', error)
    return NextResponse.json(
      { success: false, error: '退出俱樂部失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
