import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

// 檢查代理狀態
export async function GET(request: NextRequest) {
  try {
    // 從查詢參數或請求頭獲取玩家ID
    // TODO: 實際應該從認證 token 中獲取玩家ID
    const playerId = request.nextUrl.searchParams.get('playerId')
    
    if (!playerId) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少玩家ID',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 查找玩家的代理申請
    const application = await prisma.agentApplication.findFirst({
      where: {
        player: {
          userId: playerId,
        },
        status: 'approved', // 只查找已批准的申請
      },
      include: {
        player: true,
        reviewer: {
          select: {
            username: true,
          },
        },
      },
      orderBy: {
        reviewedAt: 'desc', // 獲取最新的批准記錄
      },
    })

    if (application) {
      // 玩家是已批准的代理
      return NextResponse.json(
        {
          success: true,
          data: {
            isAgent: true,
            agentRequestStatus: 'approved',
            agentDetails: {
              id: application.id,
              fullName: application.fullName,
              email: application.email,
              phone: application.phone,
              approvedAt: application.reviewedAt?.toISOString() || null,
              approvedBy: application.reviewer?.username || null,
            },
          },
        },
        { headers: corsHeaders() }
      )
    } else {
      // 檢查是否有待審核或已拒絕的申請
      const pendingOrRejected = await prisma.agentApplication.findFirst({
        where: {
          player: {
            userId: playerId,
          },
          status: {
            in: ['pending', 'rejected'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      return NextResponse.json(
        {
          success: true,
          data: {
            isAgent: false,
            agentRequestStatus: pendingOrRejected?.status || null,
            agentDetails: null,
          },
        },
        { headers: corsHeaders() }
      )
    }
  } catch (error: any) {
    console.error('檢查代理狀態失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '檢查代理狀態失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

