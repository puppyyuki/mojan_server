import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'
import {
  buildAgentLegacyContext,
  parseNonNegativeFloat,
  serializeAgentClubBinding,
  validateAgentClubBindingInput,
} from '@/lib/agent-club-binding-helpers'
import { isValidAgentLevel } from '@/lib/agent-levels'

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

    const bindings = await prisma.agentClubBinding.findMany({
      where: { playerId: playerDbId },
      include: bindingInclude,
      orderBy: { createdAt: 'asc' },
    })

    const legacyContext = await buildAgentLegacyContext(prisma, playerDbId)

    return NextResponse.json(
      {
        success: true,
        data: bindings.map(serializeAgentClubBinding),
        legacyContext,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('agent club-bindings GET failed:', error)
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
    const agentLevel = String(body.agentLevel ?? '').trim()
    const rawUpstream = body.upstreamAgentPlayerId
    const upstreamAgentPlayerId =
      rawUpstream === null || rawUpstream === undefined || rawUpstream === ''
        ? null
        : String(rawUpstream).trim()
    const agentRoomCardFee = parseNonNegativeFloat(body.agentRoomCardFee, 2)
    const agentPercentage = parseNonNegativeFloat(body.agentPercentage, 2)

    if (!clubId) {
      return NextResponse.json(
        { success: false, error: '請選擇俱樂部' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const player = await prisma.player.findUnique({
      where: { id: playerDbId },
      select: { id: true },
    })
    if (!player) {
      return NextResponse.json(
        { success: false, error: '代理玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const validation = await validateAgentClubBindingInput(prisma, {
      subjectPlayerDbId: playerDbId,
      clubId,
      agentLevel,
      upstreamAgentPlayerId,
      agentRoomCardFee,
      agentPercentage,
    })
    if (validation.ok === false) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400, headers: corsHeaders() }
      )
    }

    const existing = await prisma.agentClubBinding.findUnique({
      where: { playerId_clubId: { playerId: playerDbId, clubId } },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: '該代理在此俱樂部已有綁定，請改用編輯' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const created = await prisma.agentClubBinding.create({
      data: {
        playerId: playerDbId,
        clubId,
        upstreamAgentPlayerId,
        agentLevel: isValidAgentLevel(agentLevel) ? agentLevel : 'agent',
        agentRoomCardFee,
        agentPercentage,
      },
      include: bindingInclude,
    })

    return NextResponse.json(
      {
        success: true,
        data: serializeAgentClubBinding(created),
        message: '綁定新增成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('agent club-bindings POST failed:', error)
    return NextResponse.json(
      { success: false, error: '新增綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
