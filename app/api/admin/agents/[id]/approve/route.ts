import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { validateUpstreamAssignment } from '@/lib/upstream-agent-validation'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 批准代理申請（可附帶選填上層代理，寫入 Player.upstreamAgentPlayerId）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let body: { upstreamAgentPlayerId?: string | null } = {}
    try {
      const raw = await request.json()
      body = raw && typeof raw === 'object' ? raw : {}
    } catch {
      body = {}
    }

    let upstreamAgentPlayerId: string | null = null
    const rawU = body.upstreamAgentPlayerId as unknown
    if (rawU === null || rawU === undefined) {
      upstreamAgentPlayerId = null
    } else if (typeof rawU === 'string') {
      const t = rawU.trim()
      upstreamAgentPlayerId = t === '' ? null : t
    } else {
      return NextResponse.json(
        { success: false, error: '上層代理 id 格式不正確' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const adminUserId = await getCurrentUserId(request)

    const application = await prisma.agentApplication.findUnique({
      where: { id },
      include: { player: true },
    })

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          error: '申請不存在',
        },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (application.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: '申請狀態不正確',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    const v = await validateUpstreamAssignment(prisma, {
      subjectPlayerDbId: application.playerId,
      upstreamPlayerDbId: upstreamAgentPlayerId,
    })
    if (v.ok === false) {
      return NextResponse.json(
        { success: false, error: v.error },
        { status: 400, headers: corsHeaders() }
      )
    }

    await prisma.$transaction([
      prisma.agentApplication.update({
        where: { id },
        data: {
          status: 'approved',
          agentLevel: 'normal',
          maxClubCreateCount: 1,
          reviewedAt: new Date(),
          reviewedBy: adminUserId || null,
        },
      }),
      prisma.player.update({
        where: { id: application.playerId },
        data: { upstreamAgentPlayerId },
      }),
    ])

    return NextResponse.json(
      {
        success: true,
        message: '批准成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    console.error('批准代理申請失敗:', error)
    const msg = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json(
      {
        success: false,
        error: '批准失敗',
        message: msg,
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
