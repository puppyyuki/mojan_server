import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get('playerId')

    if (!playerId) {
      return NextResponse.json(
        { success: false, error: 'Missing playerId' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        referredPlayers: {
          select: {
            id: true,
            userId: true,
            nickname: true,
            createdAt: true, // Bound time (approximately)
          },
          orderBy: { createdAt: 'desc' },
        }
      }
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // Calculate total rewards
    // 8 cards if bound (self) + 4 cards * referralCount
    const selfReward = player.hasBoundReferrer ? 8 : 0
    const referralReward = player.referralCount * 4
    const totalRewards = selfReward + referralReward

    return NextResponse.json(
      {
        success: true,
        data: {
          referralCode: player.userId,
          referralCount: player.referralCount,
          hasBoundReferrer: player.hasBoundReferrer,
          totalRewards: totalRewards,
          referredPlayers: player.referredPlayers,
        }
      },
      { headers: corsHeaders() }
    )

  } catch (error) {
    console.error('Get referral info failed:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
