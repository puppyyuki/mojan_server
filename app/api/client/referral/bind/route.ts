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

export async function POST(request: NextRequest) {
  try {
    const { playerId, referrerCode } = await request.json()

    if (!playerId || !referrerCode) {
      return NextResponse.json(
        { success: false, error: 'Missing playerId or referrerCode' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 1. Find the current player
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    })

    if (!player) {
      return NextResponse.json(
        { success: false, error: 'Player not found' },
        { status: 404, headers: corsHeaders() }
      )
    }

    if (player.hasBoundReferrer || player.referrerId) {
      return NextResponse.json(
        { success: false, error: 'Already bound a referrer' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (player.userId === referrerCode) {
      return NextResponse.json(
        { success: false, error: 'Cannot refer yourself' },
        { status: 400, headers: corsHeaders() }
      )
    }

    // 2. Find the referrer
    const referrer = await prisma.player.findUnique({
      where: { userId: referrerCode },
    })

    if (!referrer) {
      return NextResponse.json(
        { success: false, error: 'Referrer not found' },
        { status: 404, headers: corsHeaders() }
      )
    }

    // Find an admin user for the record
    const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
    })
    
    // 3. Transaction
    await prisma.$transaction(async (tx) => {
      // Update player
      await tx.player.update({
        where: { id: playerId },
        data: {
          referrerId: referrer.id,
          hasBoundReferrer: true,
          cardCount: { increment: 8 },
        },
      })

      // Record reward for player
      if (adminUser) {
          await tx.cardRechargeRecord.create({
            data: {
              playerId: playerId,
              adminUserId: adminUser.id,
              amount: 8,
              previousCount: player.cardCount,
              newCount: player.cardCount + 8,
            },
          })
      }
      
      // Update referrer
      const updatedReferrer = await tx.player.update({
        where: { id: referrer.id },
        data: {
          referralCount: { increment: 1 },
          cardCount: { increment: 4 },
        },
      })
      
      // Record reward for referrer
      if (adminUser) {
          await tx.cardRechargeRecord.create({
            data: {
              playerId: referrer.id,
              adminUserId: adminUser.id,
              amount: 4,
              previousCount: referrer.cardCount,
              newCount: referrer.cardCount + 4,
            },
          })
      }
      
      // Check for agent promotion
      if (updatedReferrer.referralCount >= 20 && !updatedReferrer.isAgent) {
        await tx.player.update({
          where: { id: referrer.id },
          data: { isAgent: true },
        })
      }
    })
    
    return NextResponse.json(
        { success: true, message: 'Bound successfully' },
        { headers: corsHeaders() }
    )

  } catch (error) {
    console.error('Bind referral failed:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders() }
    )
  }
}
