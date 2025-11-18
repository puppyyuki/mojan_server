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
    console.log(`>>> [DEBUG] GET /api/players/${id} - 開始查詢玩家`)
    
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
      console.log(`>>> [ERROR] GET /api/players/${id} - 玩家不存在`)
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    console.log(`>>> [DEBUG] GET /api/players/${id} - 查詢成功`)
    console.log(`>>> [DEBUG] 玩家資料: id=${player.id}, userId=${player.userId}, nickname=${player.nickname}, cardCount=${player.cardCount}, bio=${player.bio}`)

    return NextResponse.json({
      success: true,
      data: player,
    }, { headers: corsHeaders() })
  } catch (error) {
    console.error(`>>> [ERROR] GET /api/players/${await params.then(p => p.id)} - 獲取玩家失敗:`, error)
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

    console.log(`>>> [DEBUG] PATCH /api/players/${id} - 更新玩家`)
    console.log(`>>> [DEBUG] 請求參數: nickname=${nickname}, cardCount=${cardCount}, bio=${bio}`)

    // 獲取當前玩家資料（用於記錄補卡前的數量）
    const currentPlayer = await prisma.player.findUnique({
      where: { id },
    })

    if (!currentPlayer) {
      console.log(`>>> [ERROR] PATCH /api/players/${id} - 玩家不存在`)
      return NextResponse.json(
        { success: false, error: '玩家不存在' },
        { status: 404, headers: corsHeaders() }
      )
    }

    console.log(`>>> [DEBUG] 當前玩家資料: cardCount=${currentPlayer.cardCount}`)

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

      console.log(`>>> [DEBUG] 更新房卡數量: ${previousCount} -> ${newCount} (變化: ${amount})`)

      // 如果有補卡（增加），記錄補卡歷史
      if (amount > 0) {
        // 獲取當前登入的管理員ID
        const adminUserId = await getCurrentUserId(request)
        
        console.log(`>>> [DEBUG] 補卡操作 - 管理員ID: ${adminUserId}`)
        
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
          console.log(`>>> [DEBUG] 補卡記錄已創建: playerId=${id}, amount=${amount}`)
        } else {
          console.log(`>>> [WARNING] 無法獲取管理員ID，補卡記錄未創建`)
        }
      }
    }

    const player = await prisma.player.update({
      where: { id },
      data: updateData,
    })

    console.log(`>>> [DEBUG] 玩家更新成功: id=${player.id}, cardCount=${player.cardCount}`)

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

