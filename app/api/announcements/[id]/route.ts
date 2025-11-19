import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

// 獲取單個活動更新
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const announcement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!announcement) {
      return NextResponse.json(
        { success: false, error: '活動更新不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: announcement,
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('獲取活動更新失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取活動更新失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 更新活動更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, content, type, isVisible } = body

    // 獲取當前活動更新
    const currentAnnouncement = await prisma.announcement.findUnique({
      where: { id },
    })

    if (!currentAnnouncement) {
      return NextResponse.json(
        { success: false, error: '活動更新不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // 如果設置為顯示，自動取消其他同類型的顯示狀態（排除自己）
    if (isVisible && (type !== undefined || isVisible !== currentAnnouncement.isVisible)) {
      const checkType = type || currentAnnouncement.type
      await prisma.announcement.updateMany({
        where: {
          type: checkType,
          isVisible: true,
          id: { not: id },
        },
        data: {
          isVisible: false,
        },
      })
    }

    const updateData: any = {}
    if (title !== undefined) {
      updateData.title = title.trim()
    }
    if (content !== undefined) {
      updateData.content = content.trim()
    }
    if (type !== undefined) {
      updateData.type = type
    }
    if (isVisible !== undefined) {
      updateData.isVisible = isVisible
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(
      {
        success: true,
        data: announcement,
        message: '活動更新更新成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('更新活動更新失敗:', error)
    return NextResponse.json(
      { success: false, error: '更新活動更新失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 刪除活動更新
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.announcement.delete({
      where: { id },
    })

    return NextResponse.json(
      {
        success: true,
        message: '活動更新刪除成功',
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('刪除活動更新失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除活動更新失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

