import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() })
}

/**
 * GET /api/admin/referrals/overview
 * 推廣總覽：至少有一名「已綁定邀請碼」下線的玩家，含下線名單（與 App「獎勵」推廣一致；referralCount 為下線完成手機綁定後累計）
 * Query: page, pageSize, keyword（邀請碼／暱稱）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20))
    const keyword = (searchParams.get('keyword') || '').trim()

    const where: Prisma.PlayerWhereInput = {
      referredPlayers: { some: {} },
      ...(keyword
        ? {
            OR: [
              { userId: { contains: keyword } },
              { nickname: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const [total, players] = await Promise.all([
      prisma.player.count({ where }),
      prisma.player.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ referralCount: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          userId: true,
          nickname: true,
          referralCount: true,
          hasBoundReferrer: true,
          createdAt: true,
          referredPlayers: {
            select: {
              id: true,
              userId: true,
              nickname: true,
              createdAt: true,
              hasBoundReferrer: true,
              phoneE164: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ])

    const items = players.map((p) => ({
      playerId: p.id,
      referralCode: p.userId,
      nickname: p.nickname,
      referralCount: p.referralCount,
      selfBoundReferrer: p.hasBoundReferrer,
      referredPlayers: p.referredPlayers.map((r) => ({
        id: r.id,
        userId: r.userId,
        nickname: r.nickname,
        registeredAt: r.createdAt,
        hasBoundReferrer: r.hasBoundReferrer,
        hasBoundPhone: Boolean(r.phoneE164),
      })),
    }))

    return NextResponse.json(
      {
        success: true,
        data: { items, total, page, pageSize },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] referrals/overview GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得推廣資料失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
