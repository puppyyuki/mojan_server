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

// 拒絕代理申請
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 從 session 或 token 獲取當前管理員 ID
    const adminUserId = await getCurrentUserId(request)

    // 查找申請
    const application = await prisma.agentApplication.findUnique({
      where: { id },
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

    // 更新申請狀態
    await prisma.agentApplication.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: adminUserId || null, // 如果無法獲取管理員 ID，設置為 null
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: '拒絕成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('拒絕代理申請失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '拒絕失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

