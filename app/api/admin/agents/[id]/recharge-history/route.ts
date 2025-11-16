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

// 獲取代理的補卡紀錄
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // 查找申請
    const application = await prisma.agentApplication.findUnique({
      where: { id },
      include: {
        player: {
          include: {
            cardRechargeRecords: {
              include: {
                adminUser: true,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      },
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

    // 格式化補卡紀錄
    const records = application.player.cardRechargeRecords.map((record) => ({
      id: record.id,
      date: record.createdAt.toISOString().split('T')[0],
      time: record.createdAt.toISOString().split('T')[1].split('.')[0],
      adminUsername: record.adminUser.username,
      amount: record.amount,
      previousCount: record.previousCount,
      newCount: record.newCount,
      createdAt: record.createdAt.toISOString(),
    }))

    return NextResponse.json(
      {
        success: true,
        data: {
          records,
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('獲取補卡紀錄失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '獲取補卡紀錄失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

