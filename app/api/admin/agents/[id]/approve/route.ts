import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'

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

// 批准代理申請（俱樂部綁定請於編輯頁完成）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 忽略 body 中的 upstreamAgentPlayerId（舊流程已停用）
    try {
      await request.json()
    } catch {
      // empty body ok
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

    await prisma.agentApplication.update({
      where: { id },
      data: {
        status: 'approved',
        agentLevel: 'agent',
        maxClubCreateCount: 1,
        reviewedAt: new Date(),
        reviewedBy: adminUserId || null,
      },
    })

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
