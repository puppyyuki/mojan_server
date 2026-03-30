import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'
import { assertAdminOpCode } from '@/lib/admin-op-code-server'

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

// 刪除代理申請
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const opCodeGuard = assertAdminOpCode(request)
    if (opCodeGuard.ok === false) {
      return opCodeGuard.response
    }
    const adminUserId = await getCurrentUserId(request)
    if (!adminUserId) {
      return NextResponse.json(
        { success: false, error: '未授權，請重新登入管理員帳號' },
        { status: 401, headers: corsHeaders() }
      )
    }

    const { id } = await params

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

    // 刪除申請（不會刪除玩家）
    await prisma.agentApplication.delete({
      where: { id },
    })

    return NextResponse.json(
      {
        success: true,
        message: '刪除成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('刪除代理申請失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '刪除失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

