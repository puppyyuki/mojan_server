import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'
import { serializePlayerClubUpstreamBinding } from '@/lib/agent-club-binding-helpers'
import { validateUpstreamAssignment } from '@/lib/upstream-agent-validation'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Op-Code',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

const bindingInclude = {
  club: { select: { id: true, clubId: true, name: true } },
  upstreamAgent: {
    select: { id: true, userId: true, nickname: true },
  },
} as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playerDbId: string; bindingId: string }> }
) {
  try {
    const { playerDbId, bindingId } = await params
    const body = await request.json().catch(() => ({}))

    const opCodeGuard = assertAdminOpCode(request, body)
    if (opCodeGuard.ok === false) {
      return opCodeGuard.response
    }

    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權' },
        { status: 401, headers: corsHeaders() }
      )
    }

    const existing = await prisma.playerClubUpstreamBinding.findFirst({
      where: { id: bindingId, playerId: playerDbId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '綁定不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const clubId =
      body.clubId !== undefined ? String(body.clubId).trim() : existing.clubId
    const upstreamAgentPlayerId =
      body.upstreamAgentPlayerId !== undefined
        ? String(body.upstreamAgentPlayerId).trim()
        : existing.upstreamAgentPlayerId

    if (!clubId) {
      return NextResponse.json(
        { success: false, error: '請選擇俱樂部' },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (!upstreamAgentPlayerId) {
      return NextResponse.json(
        { success: false, error: '請選擇上層代理' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, creatorId: true },
    })
    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const vu = await validateUpstreamAssignment(prisma, {
      subjectPlayerDbId: playerDbId,
      upstreamPlayerDbId: upstreamAgentPlayerId,
    })
    if (vu.ok === false) {
      return NextResponse.json(
        { success: false, error: vu.error },
        { status: 400, headers: corsHeaders() }
      )
    }

    const subjectAgentBinding = await prisma.agentClubBinding.findUnique({
      where: { playerId_clubId: { playerId: playerDbId, clubId } },
      select: { id: true },
    })
    if (subjectAgentBinding) {
      return NextResponse.json(
        {
          success: false,
          error: '此玩家在該俱樂部已是代理，請至代理管理設定',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (upstreamAgentPlayerId !== club.creatorId) {
      const upstreamClubAgent = await prisma.agentClubBinding.findUnique({
        where: {
          playerId_clubId: {
            playerId: upstreamAgentPlayerId,
            clubId,
          },
        },
        select: { id: true },
      })
      if (!upstreamClubAgent) {
        return NextResponse.json(
          { success: false, error: '所選上層代理不在此俱樂部' },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    if (clubId !== existing.clubId) {
      const dup = await prisma.playerClubUpstreamBinding.findUnique({
        where: { playerId_clubId: { playerId: playerDbId, clubId } },
      })
      if (dup) {
        return NextResponse.json(
          { success: false, error: '該玩家在此俱樂部已有其他綁定' },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    const existingMember = await prisma.clubMember.findUnique({
      where: { clubId_playerId: { clubId, playerId: playerDbId } },
      select: { id: true },
    })
    if (!existingMember) {
      const [player, joinedClubCount] = await Promise.all([
        prisma.player.findUnique({
          where: { id: playerDbId },
          select: { maxJoinClubCount: true },
        }),
        prisma.clubMember.count({ where: { playerId: playerDbId } }),
      ])
      const joinLimit = Math.max(Number(player?.maxJoinClubCount) || 3, 1)
      if (joinedClubCount >= joinLimit) {
        return NextResponse.json(
          { success: false, error: `已達可加入俱樂部上限（${joinLimit}）` },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.clubMember.upsert({
        where: { clubId_playerId: { clubId, playerId: playerDbId } },
        create: { clubId, playerId: playerDbId },
        update: {},
      })

      return tx.playerClubUpstreamBinding.update({
        where: { id: bindingId },
        data: { clubId, upstreamAgentPlayerId },
        include: bindingInclude,
      })
    })

    return NextResponse.json(
      {
        success: true,
        data: serializePlayerClubUpstreamBinding(updated),
        message: '綁定更新成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('player club-upstream-binding PATCH failed:', error)
    return NextResponse.json(
      { success: false, error: '更新綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerDbId: string; bindingId: string }> }
) {
  try {
    const { playerDbId, bindingId } = await params

    const opCodeGuard = assertAdminOpCode(request)
    if (opCodeGuard.ok === false) {
      return opCodeGuard.response
    }

    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權' },
        { status: 401, headers: corsHeaders() }
      )
    }

    const existing = await prisma.playerClubUpstreamBinding.findFirst({
      where: { id: bindingId, playerId: playerDbId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '綁定不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    await prisma.playerClubUpstreamBinding.delete({ where: { id: bindingId } })

    return NextResponse.json(
      { success: true, message: '綁定已刪除' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('player club-upstream-binding DELETE failed:', error)
    return NextResponse.json(
      { success: false, error: '刪除綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
