import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'
import {
  parseNonNegativeFloat,
  serializeAgentClubBinding,
  validateAgentClubBindingInput,
} from '@/lib/agent-club-binding-helpers'
import { isValidAgentLevel } from '@/lib/agent-levels'

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

    const existing = await prisma.agentClubBinding.findFirst({
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
    const agentLevel =
      body.agentLevel !== undefined
        ? String(body.agentLevel).trim()
        : existing.agentLevel
    let upstreamAgentPlayerId = existing.upstreamAgentPlayerId
    if (body.upstreamAgentPlayerId !== undefined) {
      const raw = body.upstreamAgentPlayerId
      upstreamAgentPlayerId =
        raw === null || raw === '' ? null : String(raw).trim()
    }
    const agentRoomCardFee =
      body.agentRoomCardFee !== undefined
        ? parseNonNegativeFloat(body.agentRoomCardFee, existing.agentRoomCardFee)
        : existing.agentRoomCardFee
    const agentPercentage =
      body.agentPercentage !== undefined
        ? parseNonNegativeFloat(body.agentPercentage, existing.agentPercentage)
        : existing.agentPercentage

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

    if (clubId !== existing.clubId) {
      const dup = await prisma.agentClubBinding.findUnique({
        where: { playerId_clubId: { playerId: playerDbId, clubId } },
      })
      if (dup) {
        return NextResponse.json(
          { success: false, error: '該代理在此俱樂部已有其他綁定' },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    const updated = await prisma.agentClubBinding.update({
      where: { id: bindingId },
      data: {
        clubId,
        agentLevel: isValidAgentLevel(agentLevel) ? agentLevel : existing.agentLevel,
        upstreamAgentPlayerId,
        agentRoomCardFee,
        agentPercentage,
      },
      include: bindingInclude,
    })

    return NextResponse.json(
      {
        success: true,
        data: serializeAgentClubBinding(updated),
        message: '綁定更新成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('agent club-binding PATCH failed:', error)
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

    const existing = await prisma.agentClubBinding.findFirst({
      where: { id: bindingId, playerId: playerDbId },
    })
    if (!existing) {
      return NextResponse.json(
        { success: false, error: '綁定不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    await prisma.agentClubBinding.delete({ where: { id: bindingId } })

    return NextResponse.json(
      { success: true, message: '綁定已刪除' },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('agent club-binding DELETE failed:', error)
    return NextResponse.json(
      { success: false, error: '刪除綁定失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
