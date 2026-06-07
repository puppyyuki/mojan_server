import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AGENT_LEVELS } from '@/lib/agent-levels'

/** 接受新五級及舊三級（唯讀相容，不再作為新綁定預設） */
const ALLOWED_GLOBAL_LEVELS = [...AGENT_LEVELS, 'normal', 'vip'] as const

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

// 更新代理層級
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { agentLevel, maxClubCreateCount } = body

    const parsedMaxClubCreateCount = Number(maxClubCreateCount)
    if (!Number.isFinite(parsedMaxClubCreateCount) || parsedMaxClubCreateCount < 1) {
      return NextResponse.json(
        {
          success: false,
          error: '代理可創建俱樂部數量必須為大於等於 1 的數字',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (
      agentLevel !== undefined &&
      agentLevel !== null &&
      agentLevel !== '' &&
      !ALLOWED_GLOBAL_LEVELS.includes(agentLevel)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: '無效的代理層級',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 查找申請
    const application = await prisma.agentApplication.findUnique({
      where: { id },
    })

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          error: '代理申請不存在',
        },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (application.status !== 'approved') {
      return NextResponse.json(
        {
          success: false,
          error: '只能修改已批准代理的層級',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 更新代理層級
    const updateData: { maxClubCreateCount: number; agentLevel?: string } = {
      maxClubCreateCount: Math.floor(parsedMaxClubCreateCount),
    }
    if (
      agentLevel !== undefined &&
      agentLevel !== null &&
      agentLevel !== '' &&
      ALLOWED_GLOBAL_LEVELS.includes(agentLevel)
    ) {
      updateData.agentLevel = agentLevel
    }

    await prisma.agentApplication.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(
      {
        success: true,
        message: '更新代理層級成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('更新代理層級失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '更新代理層級失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

