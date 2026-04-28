import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { agentLevelLabelZh } from '@/lib/agent-level-display'

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
 * 列出可作為「上層代理」的對象：已核准 AgentApplication 的玩家。
 * 選用 ?excludePlayerId= 排除本人（審核／編輯時使用）。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const excludeRaw = searchParams.get('excludePlayerId')?.trim()
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get('limit') ?? '200', 10) || 200)
    )

    const playersList = await prisma.player.findMany({
      where: {
        agentApplications: { some: { status: 'approved' } },
        ...(excludeRaw ? { id: { not: excludeRaw } } : {}),
      },
      select: {
        id: true,
        userId: true,
        nickname: true,
        agentApplications: {
          where: { status: 'approved' },
          orderBy: { reviewedAt: 'desc' },
          take: 1,
          select: { agentLevel: true },
        },
      },
      orderBy: [{ nickname: 'asc' }, { userId: 'asc' }],
      take: limit,
    })

    const data = playersList.map((p) => {
      const level = p.agentApplications[0]?.agentLevel ?? 'normal'
      return {
        id: p.id,
        userId: p.userId,
        nickname: p.nickname,
        agentLevel: level,
        agentLevelLabel: agentLevelLabelZh(level),
      }
    })

    return NextResponse.json(
      { success: true, data },
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
