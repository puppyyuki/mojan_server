import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserId } from '@/lib/auth'

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// 處理 OPTIONS 請求（CORS preflight）
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

// 獲取單個玩家
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        createdClubs: true,
        clubMembers: {
          include: {
            club: true,
          },
        },
      },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return NextResponse.json({
      success: true,
      data: player,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('獲取玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '獲取玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 更新玩家
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nickname, cardCount, bio } = body

    // 獲取當前玩家資料（用於記錄補卡前的數量）
    const currentPlayer = await prisma.player.findUnique({
      where: { id },
    })

    if (!currentPlayer) {
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    const updateData: any = {}
    if (nickname !== undefined) {
      updateData.nickname = nickname.trim()
    }
    if (cardCount !== undefined) {
      updateData.cardCount = parseInt(cardCount)
    }
    if (bio !== undefined) {
      updateData.bio = bio === null || bio === '' ? null : bio.trim()
    }

    // 如果更新暱稱，檢查是否重複
    if (updateData.nickname) {
      const existingPlayer = await prisma.player.findFirst({
        where: {
          nickname: updateData.nickname,
          NOT: { id },
        },
      })

      if (existingPlayer) {
        return NextResponse.json(
          { success: false, error: '暱稱已存在' },
          { status: 400, headers: corsHeaders() }
        )
      }
    }

    // 如果更新房卡數量，記錄補卡操作
    if (cardCount !== undefined) {
      const previousCount = currentPlayer.cardCount
      const newCount = parseInt(cardCount)
      const amount = newCount - previousCount

      // 如果有補卡（增加），記錄補卡歷史
      if (amount > 0) {
        // 獲取當前登入的管理員ID
        const adminUserId = await getCurrentUserId(request)
        
        if (adminUserId) {
          // 記錄補卡操作
          await prisma.cardRechargeRecord.create({
            data: {
              playerId: id,
              adminUserId: adminUserId,
              amount: amount,
              previousCount: previousCount,
              newCount: newCount,
            },
          })
        }
      }
    }

    const player = await prisma.player.update({
      where: { id },
      data: updateData,
    })

    // 如果更新了房卡數量，通知 WebSocket 伺服器推送更新
    if (cardCount !== undefined) {
      try {
        const socketServerUrl = process.env.SOCKET_SERVER_URL || process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3000'
        const notifyUrl = `${socketServerUrl}/api/internal/notify-card-update`
        
        // 異步調用，不等待響應（避免阻塞 API 響應）
        fetch(notifyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            playerId: id,
            cardCount: player.cardCount,
          }),
        }).catch((error) => {
          // 記錄錯誤但不影響 API 響應
          console.error('通知 WebSocket 伺服器失敗:', error)
        })
      } catch (error) {
        // 記錄錯誤但不影響 API 響應
        console.error('通知 WebSocket 伺服器時發生錯誤:', error)
      }
    }

    return NextResponse.json({
      success: true,
      data: player,
      message: '玩家更新成功',
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('更新玩家失敗:', error)
    const errorMessage = error instanceof Error ? error.message : '更新玩家失敗'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}

// 刪除玩家
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.player.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: '玩家刪除成功',
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error('刪除玩家失敗:', error)
    return NextResponse.json(
      { success: false, error: '刪除玩家失敗' },
      { status: 500, headers: corsHeaders() }
    )
  }
}

