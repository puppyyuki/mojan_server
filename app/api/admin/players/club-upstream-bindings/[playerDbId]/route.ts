import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'
import { serializePlayerClubUpstreamBinding } from '@/lib/agent-club-binding-helpers'
import { validateUpstreamAssignment } from '@/lib/upstream-agent-validation'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerDbId: string }> }
) {
  try {
    const { playerDbId } = await params

    const [bindings, agentClubBindings, approvedAgentApp] = await Promise.all([
      prisma.playerClubUpstreamBinding.findMany({
        where: { playerId: playerDbId },
        include: bindingInclude,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.agentClubBinding.findMany({
        where: { playerId: playerDbId },
        select: { clubId: true },
      }),
      prisma.agentApplication.findFirst({
        where: { playerId: playerDbId, status: 'approved' },
        select: { id: true },
      }),
    ])

    const agentClubIds = new Set(agentClubBindings.map((b) => b.clubId))
    const filteredBindings = bindings.filter((b) => !agentClubIds.has(b.clubId))

    const player = await prisma.player.findUnique({
      where: { id: playerDbId },
      select: {
        upstreamAgent: {
          select: { id: true, userId: true, nickname: true },
        },
      },
    })

    const legacyUpstreamAgent = player?.upstreamAgent
      ? {
          playerDbId: player.upstreamAgent.id,
          userId: player.upstreamAgent.userId,
          nickname: player.upstreamAgent.nickname,
        }
      : null

    return NextResponse.json(
      {
        success: true,
        data: filteredBindings.map(serializePlayerClubUpstreamBinding),
        legacyUpstreamAgent,
        isApprovedAgent: Boolean(approvedAgentApp),
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('player club-upstream-bindings GET failed:', error)
    return NextResponse.json(
      { success: false, error: '載入綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerDbId: string }> }
) {
  try {
    const { playerDbId } = await params
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

    const clubId = String(body.clubId ?? '').trim()
    const upstreamAgentPlayerId = String(body.upstreamAgentPlayerId ?? '').trim()

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

    const player = await prisma.player.findUnique({
      where: { id: playerDbId },
      select: { id: true },
    })
    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
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

    const existing = await prisma.playerClubUpstreamBinding.findUnique({
      where: { playerId_clubId: { playerId: playerDbId, clubId } },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: '該玩家在此俱樂部已有綁定，請改用編輯' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const created = await prisma.playerClubUpstreamBinding.create({
      data: {
        playerId: playerDbId,
        clubId,
        upstreamAgentPlayerId,
      },
      include: bindingInclude,
    })

    return NextResponse.json(
      {
        success: true,
        data: serializePlayerClubUpstreamBinding(created),
        message: '綁定新增成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('player club-upstream-bindings POST failed:', error)
    return NextResponse.json(
      { success: false, error: '新增綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
