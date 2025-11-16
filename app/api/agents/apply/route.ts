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

// 提交代理申請
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fullName, email, phone, note, phoneOtpCode, emailOtpCode, playerId } = body

    if (!fullName || !email || !phone || !playerId) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必填欄位',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 檢查玩家是否存在
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    })

    if (!player) {
      return NextResponse.json(
        {
          success: false,
          error: '玩家不存在',
        },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 檢查是否已有申請記錄（任何狀態）
    const existingApplication = await prisma.agentApplication.findFirst({
      where: {
        playerId: playerId,
      },
      orderBy: {
        createdAt: 'desc', // 獲取最新的申請記錄
      },
    })

    let application

    if (existingApplication) {
      // 如果已有申請記錄
      if (existingApplication.status === 'pending') {
        // 已有待審核的申請，不允許重複提交
        return NextResponse.json(
          {
            success: false,
            error: '您已有待審核的申請',
          },
          { status: 400, headers: corsHeaders() }
        )
      } else if (existingApplication.status === 'approved') {
        // 已經是代理，不允許重新申請
        return NextResponse.json(
          {
            success: false,
            error: '您已經是代理，無需重新申請',
          },
          { status: 400, headers: corsHeaders() }
        )
      } else if (existingApplication.status === 'rejected') {
        // 被拒絕後重新提交，更新現有記錄
        application = await prisma.agentApplication.update({
          where: { id: existingApplication.id },
          data: {
            fullName: fullName,
            email: email,
            phone: phone,
            note: note || null,
            phoneOtpCode: phoneOtpCode || '000000',
            emailOtpCode: emailOtpCode || '000000',
            status: 'pending', // 重新設置為待審核
            reviewedAt: null, // 清除審核時間
            reviewedBy: null, // 清除審核者
          },
        })
      }
    } else {
      // 沒有申請記錄，創建新記錄
      application = await prisma.agentApplication.create({
        data: {
          playerId: playerId,
          fullName: fullName,
          email: email,
          phone: phone,
          note: note || null,
          phoneOtpCode: phoneOtpCode || '000000',
          emailOtpCode: emailOtpCode || '000000',
          status: 'pending',
        },
      })
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          applicationId: application.id,
          message: '申請提交成功，請等待審核',
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error: any) {
    console.error('提交代理申請失敗:', error)
    return NextResponse.json(
      {
        success: false,
        error: '提交申請失敗',
        message: error.message || '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}

