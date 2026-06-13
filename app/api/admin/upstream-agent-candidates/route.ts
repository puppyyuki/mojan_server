import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canAssignSuperAgentLevel,
  findClubSuperAgentBinding,
} from '@/lib/agent-club-binding-helpers'
import { listClubUpstreamAgentCandidates } from '@/lib/clubUpstreamAgentCandidates'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

/**
 * 依俱樂部 AgentClubBinding 列出上層代理候選（八階層級標籤）。
 * Query: clubId（俱樂部 DB id，必填）、excludePlayerId、search
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clubDbId = searchParams.get('clubId')?.trim()
    const excludeRaw = searchParams.get('excludePlayerId')?.trim()
    const searchRaw = searchParams.get('search')?.trim() ?? ''

    if (!clubDbId) {
      return NextResponse.json(
        { success: false, error: '請提供俱樂部 ID' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findUnique({
      where: { id: clubDbId },
      select: { id: true, creatorId: true },
    })

    if (!club) {
      return NextResponse.json(
        { success: false, error: '俱樂部不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const [rows, superBinding] = await Promise.all([
      listClubUpstreamAgentCandidates(prisma, {
        clubInternalId: club.id,
        creatorId: club.creatorId,
        excludePlayerId: excludeRaw || null,
        searchRaw,
      }),
      findClubSuperAgentBinding(prisma, club.id),
    ])

    const subjectPlayerDbId = excludeRaw || ''
    const canAssignSuper = canAssignSuperAgentLevel(
      superBinding,
      subjectPlayerDbId
    )

    const data = rows.map(
      (c: {
        playerId: string
        userId: string
        nickname: string
        agentLevel: string
        agentLevelLabel: string
      }) => ({
        id: c.playerId,
        userId: c.userId,
        nickname: c.nickname,
        agentLevel: c.agentLevel,
        agentLevelLabel: c.agentLevelLabel,
      })
    )

    return NextResponse.json(
      {
        success: true,
        data,
        meta: {
          canAssignSuper,
          superAgent: superBinding
            ? {
                playerDbId: superBinding.playerId,
                userId: superBinding.player.userId,
                nickname: superBinding.player.nickname,
              }
            : null,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    console.error('upstream-agent-candidates:', error)
    return NextResponse.json(
      { success: false, error: '無法載入上層代理候選' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
