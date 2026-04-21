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

// 搜索玩家
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { search } = body
        const keyword = String(search || '').trim()

        console.log('[Next.js Player Search] Received search request:', { search })
        console.log('[Next.js Player Search] DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set')

        if (!/^\d{6}$/.test(keyword)) {
            return NextResponse.json(
                {
                    success: false,
                    error: '僅支援 6 位數玩家ID搜尋',
                },
                { status: 400, headers: corsHeaders() }
            )
        }

        // 搜索玩家
        const players = await prisma.player.findMany({
            where: { userId: keyword },
            select: {
                id: true,
                userId: true,
                nickname: true,
                avatarUrl: true,
                cardCount: true,
            },
            take: 50,
        })

        console.log('[Next.js Player Search] Found players with search:', players.length)
        console.log('[Next.js Player Search] Players:', players)

        return NextResponse.json(
            {
                success: true,
                data: {
                    players: players.map(p => ({
                        playerId: p.id,
                        userId: p.userId,
                        displayName: p.nickname,
                        avatarUrl: p.avatarUrl,
                        cardCount: p.cardCount,
                    })),
                },
            },
            { headers: corsHeaders() }
        )
    } catch (error: any) {
        console.error('[Next.js Player Search] Error:', error)
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to search players',
                message: error.message,
            },
            { status: 500, headers: corsHeaders() }
        )
    }
}
