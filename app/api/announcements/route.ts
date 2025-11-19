import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateUniqueId } from '@/lib/utils'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取所有活動更新
export async function GET(request: NextRequest) {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      {
        success: true,
        data: announcements,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取活動更新列表失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取活動更新列表失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 創建活動更新
export async function POST(request: NextRequest) {
  try {
    const { title, content, type, isVisible } = await request.json()

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入標題' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '請輸入內容' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (!type || (type !== '活動' && type !== '更新')) {
      return NextResponse.json(
        { success: false, error: '請選擇類型（活動或更新）' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 如果設置為顯示，自動取消其他同類型的顯示狀態
    if (isVisible) {
      await prisma.announcement.updateMany({
        where: {
          type: type,
          isVisible: true,
        },
        data: {
          isVisible: false,
        },
      })
    }

    // 生成唯一的6位數字ID
    const announcementId = await generateUniqueId(async (id) => {
      const exists = await prisma.announcement.findUnique({
        where: { announcementId: id },
      })
      return !exists
    })

    // 創建活動更新
    const announcement = await prisma.announcement.create({
      data: {
        announcementId,
        title: title.trim(),
        content: content.trim(),
        type,
        isVisible: isVisible || false,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: announcement,
        message: '活動更新創建成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('創建活動更新失敗:', error)
    return NextResponse.json(
      { success: false, error: '創建活動更新失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

