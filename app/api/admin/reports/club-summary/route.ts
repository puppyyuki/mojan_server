import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseTaipeiDateEnd, parseTaipeiDateStart } from '@/lib/taipei-time'
import { agentLevelLabelZh } from '@/lib/agent-level-display'
import { levelOrder } from '@/lib/agent-levels'

const { isV2RoundCompletedForStatistics } = require('../../../../../utils/v2RoundStatistics')
const { aggregateSelfDrawStatsByPlayerId } = require('../../../../../utils/clubSelfDrawRakeMoney')
const { computeViewerSelfDrawRakeForRow } = require('../../../../../utils/clubAgentSelfDrawRakeTree')
const {
  computeViewerRoomCardFeeForRow,
  resolveEffectiveRoomCardFee,
} = require('../../../../../utils/clubBranchRoomCardFee')

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

const DEFAULT_VENUE_DRAW_PERCENT = 5 // 與 Prisma Club.venueDrawPercent 預設一致
const DEFAULT_SELF_DRAW_RAKE_PERCENT = 8 // 與 Prisma Club.selfDrawRakePercent 預設一致

function venueDrawDecimalFromPercent(p: number | null | undefined): number {
  if (p == null || !Number.isFinite(Number(p))) return DEFAULT_VENUE_DRAW_PERCENT / 100
  const clamped = Math.min(100, Math.max(0, Number(p)))
  return clamped / 100
}

function selfDrawRakeDecimalFromPercent(p: number | null | undefined): number {
  if (p == null || !Number.isFinite(Number(p))) return DEFAULT_SELF_DRAW_RAKE_PERCENT / 100
  const clamped = Math.min(100, Math.max(0, Number(p)))
  return clamped / 100
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** 該局該座位分數變化（與 rooms normalizeScoresBySeat 一致） */
function seatScoreDelta(scoreChangeBySeat: unknown, seat: number): number {
  if (!scoreChangeBySeat || typeof scoreChangeBySeat !== 'object' || Array.isArray(scoreChangeBySeat)) {
    return 0
  }
  const o = scoreChangeBySeat as Record<string, unknown>
  const v = o[seat] ?? o[String(seat)]
  return Number(v ?? 0) || 0
}

function scoringUnitFromStoredGameSettings(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 20
  const n = Number((raw as Record<string, unknown>).scoring_unit)
  if (!Number.isFinite(n)) return 20
  return Math.max(0, Math.floor(n))
}

function selfDrawWinnerSeatFromRoundEndPayload(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const payload = raw as Record<string, unknown>
  if (payload.isExhaustiveDraw === true) return null

  const winnerSeat = Number(payload.winnerSeat)
  if (!Number.isInteger(winnerSeat) || winnerSeat < 0 || winnerSeat > 3) return null

  const fromSeat = Number(payload.fromSeat)
  if (Number.isInteger(fromSeat) && fromSeat === winnerSeat) return winnerSeat

  const huType = typeof payload.huType === 'string' ? payload.huType.toLowerCase() : ''
  const claimType = typeof payload.claimType === 'string' ? payload.claimType.toLowerCase() : ''
  if (huType.includes('selfdraw') || claimType.includes('selfdraw')) return winnerSeat
  if (payload.isSelfDraw === true || payload.selfDraw === true) return winnerSeat

  return null
}

/**
 * GET /api/admin/reports/club-summary
 * 俱樂部玩家報表：指定時間區間＋俱樂部 ID，彙整玩家戰績/大贏家/房卡消耗/場次；
 * 自摸東（dongMoney）＝每場（含 FINISHED / DISBANDED）逐局判定自摸次數 × 該場台數，再依查詢區間加總；
 * 場抽（waterMoney）＝各場結算或中途解散後分數為正者 × 該俱樂部「場抽」百分比（俱樂部管理可設定，預設 5%）
 * 自摸抽（selfDrawRakeMoney）＝每局判定自摸且該家當局分數變化為正者 × 該俱樂部「自摸抽」百分比（預設 8%）
 * Query: startDate, endDate (YYYY-MM-DD), clubId（俱樂部 6 碼）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startRaw = (searchParams.get('startDate') || '').trim()
    const endRaw = (searchParams.get('endDate') || '').trim()
    const clubSixId = (searchParams.get('clubId') || '').trim()

    if (!startRaw || !endRaw || !clubSixId) {
      return NextResponse.json(
        {
          success: false,
          error: '請提供完整查詢條件（時間區間與俱樂部 ID）',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    const startAt = parseTaipeiDateStart(startRaw)
    const endAt = parseTaipeiDateEnd(endRaw)
    if (!startAt || !endAt) {
      return NextResponse.json(
        {
          success: false,
          error: '時間格式錯誤，請使用 YYYY-MM-DD',
        },
        { status: 400, headers: corsHeaders() }
      )
    }
    if (startAt > endAt) {
      return NextResponse.json(
        {
          success: false,
          error: '開始日期不可晚於結束日期',
        },
        { status: 400, headers: corsHeaders() }
      )
    }

    const club = await prisma.club.findFirst({
      where: { clubId: clubSixId },
      select: {
        id: true,
        clubId: true,
        name: true,
        venueDrawPercent: true,
        selfDrawRakePercent: true,
        roomCardFee: true,
        branchRoomCardEnabled: true,
      },
    })
    if (!club) {
      return NextResponse.json(
        {
          success: true,
          data: {
            rows: [],
            totals: {
              playerCount: 0,
              totalBattleScore: 0,
              totalSelfDrawCount: 0,
              totalRoomCardConsumed: 0,
              totalRoomCardFeeAmount: 0,
              totalCompletedGames: 0,
              totalDongMoney: 0,
              totalWaterMoney: 0,
              totalSelfDrawRakeMoney: 0,
            },
            filter: { startDate: startRaw, endDate: endRaw, clubId: clubSixId },
            club: { clubInternalId: null, clubSixId, clubName: '俱樂部不存在' },
          },
        },
        { headers: corsHeaders() }
      )
    }

    const waterRate = venueDrawDecimalFromPercent(club.venueDrawPercent)
    const selfDrawRakeRate = selfDrawRakeDecimalFromPercent(club.selfDrawRakePercent)

    const gameResults = await prisma.clubGameResult.findMany({
      where: {
        clubId: club.id,
        endedAt: {
          gte: startAt,
          lte: endAt,
        },
      },
      orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        players: true,
        roomInternalId: true,
      },
    })

    const settledSessions = await prisma.v2MatchSession.findMany({
      where: {
        clubId: club.id,
        status: { in: ['FINISHED', 'DISBANDED'] },
        endedAt: { gte: startAt, lte: endAt },
      },
      select: {
        id: true,
        roomInternalId: true,
        gameSettings: true,
        participants: {
          select: {
            playerId: true,
            seat: true,
            userId: true,
            nickname: true,
          },
        },
        rounds: {
          select: {
            roundEndPayload: true,
            scoreChangeBySeat: true,
          },
        },
      },
    })

    const roomInternalIds = [
      ...new Set(
        [...gameResults.map((gr) => gr.roomInternalId), ...settledSessions.map((sess) => sess.roomInternalId)].filter(
          (rid): rid is string => typeof rid === 'string' && !!rid
        )
      ),
    ]
    const roomRows =
      roomInternalIds.length > 0
        ? await prisma.room.findMany({
            where: { id: { in: roomInternalIds } },
            select: { id: true, gameSettings: true },
          })
        : []
    const gameSettingsByRoomId = new Map(roomRows.map((r) => [r.id, r.gameSettings]))

    const completedRounds = await prisma.v2MatchRound.findMany({
      where: {
        session: { clubId: club.id },
        endedAt: { gte: startAt, lte: endAt },
      },
      select: {
        roundEndPayload: true,
        session: {
          select: {
            participants: { select: { playerId: true } },
          },
        },
      },
    })

    const completedGamesByPlayer = new Map<string, number>()
    for (const rr of completedRounds) {
      if (!isV2RoundCompletedForStatistics(rr.roundEndPayload)) continue
      for (const part of rr.session?.participants ?? []) {
        const pid = part.playerId
        if (!pid) continue
        completedGamesByPlayer.set(pid, (completedGamesByPlayer.get(pid) || 0) + 1)
      }
    }

    type PlayerAgg = {
      playerId: string
      userId: string
      nickname: string
      battleScore: number
      bigWinnerCount: number
      selfDrawCount: number
      roomCardConsumed: number
      completedGames: number
      dongMoney: number
      waterMoney: number
      selfDrawRakeMoney: number
    }

    const playerAggMap = new Map<string, PlayerAgg>()

    for (const result of gameResults) {
      const players = Array.isArray(result.players) ? result.players : []

      for (const item of players) {
        if (!item || typeof item !== 'object') continue
        const p = item as Record<string, unknown>
        const playerId = typeof p.playerId === 'string' ? p.playerId : ''
        if (!playerId) continue

        const userId = typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : '—'
        const nickname =
          typeof p.nickname === 'string' && p.nickname.trim() ? p.nickname.trim() : '未知玩家'
        const score = Number(p.score ?? 0) || 0
        const roomCardConsumed = Number(p.roomCardConsumed ?? 0) || 0
        const isBigWinner = p.isBigWinner === true
        const waterThisGame = score > 0 ? score * waterRate : 0

        const existing = playerAggMap.get(playerId)
        if (!existing) {
          playerAggMap.set(playerId, {
            playerId,
            userId,
            nickname,
            battleScore: score,
            bigWinnerCount: isBigWinner ? 1 : 0,
            selfDrawCount: 0,
            roomCardConsumed,
            completedGames: 0,
            dongMoney: 0,
            waterMoney: waterThisGame,
            selfDrawRakeMoney: 0,
          })
          continue
        }

        existing.battleScore += score
        existing.bigWinnerCount += isBigWinner ? 1 : 0
        existing.roomCardConsumed += roomCardConsumed
        existing.waterMoney += waterThisGame
        if (existing.userId === '—' && userId !== '—') {
          existing.userId = userId
        }
        if (existing.nickname === '未知玩家' && nickname !== '未知玩家') {
          existing.nickname = nickname
        }
      }
    }

    for (const sess of settledSessions) {
      const roomGs = sess.roomInternalId ? gameSettingsByRoomId.get(sess.roomInternalId) : undefined
      const taiUnit = scoringUnitFromStoredGameSettings(roomGs ?? sess.gameSettings)
      const seatToParticipant = new Map(
        (sess.participants ?? []).map((p) => [
          p.seat,
          {
            playerId: p.playerId,
            userId: typeof p.userId === 'string' && p.userId.trim() ? p.userId.trim() : '—',
            nickname: typeof p.nickname === 'string' && p.nickname.trim() ? p.nickname.trim() : '未知玩家',
          },
        ])
      )

      for (const round of sess.rounds ?? []) {
        const winnerSeat = selfDrawWinnerSeatFromRoundEndPayload(round.roundEndPayload)
        if (winnerSeat == null) continue
        const winner = seatToParticipant.get(winnerSeat)
        if (!winner?.playerId) continue

        const winDelta = seatScoreDelta(round.scoreChangeBySeat, winnerSeat)
        const winForRake = winDelta > 0 ? winDelta : 0
        const rakeThisRound = winForRake * selfDrawRakeRate

        const existing = playerAggMap.get(winner.playerId)
        if (!existing) {
          playerAggMap.set(winner.playerId, {
            playerId: winner.playerId,
            userId: winner.userId,
            nickname: winner.nickname,
            battleScore: 0,
            bigWinnerCount: 0,
            selfDrawCount: 1,
            roomCardConsumed: 0,
            completedGames: 0,
            dongMoney: taiUnit,
            waterMoney: 0,
            selfDrawRakeMoney: rakeThisRound,
          })
          continue
        }

        existing.selfDrawCount += 1
        existing.dongMoney += taiUnit
        existing.selfDrawRakeMoney += rakeThisRound
        if (existing.userId === '—' && winner.userId !== '—') {
          existing.userId = winner.userId
        }
        if (existing.nickname === '未知玩家' && winner.nickname !== '未知玩家') {
          existing.nickname = winner.nickname
        }
      }
    }

    const roundOnlyIds = [...completedGamesByPlayer.keys()].filter((id) => !playerAggMap.has(id))
    if (roundOnlyIds.length) {
      const playersMeta = await prisma.player.findMany({
        where: { id: { in: roundOnlyIds } },
        select: { id: true, userId: true, nickname: true },
      })
      const metaById = new Map(playersMeta.map((pl) => [pl.id, pl]))
      for (const pid of roundOnlyIds) {
        const meta = metaById.get(pid)
        const userId =
          typeof meta?.userId === 'string' && meta.userId.trim() ? meta.userId.trim() : '—'
        const nickname =
          typeof meta?.nickname === 'string' && meta.nickname.trim()
            ? meta.nickname.trim()
            : '未知玩家'
        playerAggMap.set(pid, {
          playerId: pid,
          userId,
          nickname,
          battleScore: 0,
          bigWinnerCount: 0,
          selfDrawCount: 0,
          roomCardConsumed: 0,
          completedGames: 0,
          dongMoney: 0,
          waterMoney: 0,
          selfDrawRakeMoney: 0,
        })
      }
    }

    const disbandedSessions = await prisma.v2MatchSession.findMany({
      where: {
        clubId: club.id,
        status: 'DISBANDED',
        endedAt: { gte: startAt, lte: endAt },
      },
      select: {
        participants: {
          select: { playerId: true, matchTotalScore: true, userId: true, nickname: true },
        },
      },
    })
    for (const sess of disbandedSessions) {
      for (const part of sess.participants ?? []) {
        const playerId = part.playerId
        if (!playerId) continue
        const score = Number(part.matchTotalScore ?? 0) || 0
        const waterThisGame = score > 0 ? score * waterRate : 0
        if (waterThisGame === 0) continue
        const existing = playerAggMap.get(playerId)
        if (existing) {
          existing.waterMoney += waterThisGame
          continue
        }
        const userId =
          typeof part.userId === 'string' && part.userId.trim() ? part.userId.trim() : '—'
        const nickname =
          typeof part.nickname === 'string' && part.nickname.trim() ? part.nickname.trim() : '未知玩家'
        playerAggMap.set(playerId, {
          playerId,
          userId,
          nickname,
          battleScore: 0,
          bigWinnerCount: 0,
          selfDrawCount: 0,
          roomCardConsumed: 0,
          completedGames: 0,
          dongMoney: 0,
          waterMoney: waterThisGame,
          selfDrawRakeMoney: 0,
        })
      }
    }

    for (const row of playerAggMap.values()) {
      row.completedGames = completedGamesByPlayer.get(row.playerId) || 0
    }

    const [agentBindings, upstreamBindings, branchFees] = await Promise.all([
      prisma.agentClubBinding.findMany({
        where: { clubId: club.id },
        select: {
          playerId: true,
          upstreamAgentPlayerId: true,
          agentLevel: true,
          agentPercentage: true,
          player: { select: { id: true, userId: true, nickname: true } },
        },
      }),
      prisma.playerClubUpstreamBinding.findMany({
        where: { clubId: club.id },
        select: {
          playerId: true,
          upstreamAgentPlayerId: true,
        },
      }),
      prisma.clubRoomCardBranchFee.findMany({
        where: { clubId: club.id },
        select: {
          masterAgentPlayerId: true,
          branchRoomCardFee: true,
        },
      }),
    ])

    const agentBindingByPlayerId = new Map(agentBindings.map((b) => [b.playerId, b]))
    const agentPlayerIds = new Set(agentBindings.map((b) => b.playerId))
    const { winByPlayer, poolByPlayer, rakePercent } = await aggregateSelfDrawStatsByPlayerId(
      prisma,
      { id: club.id, selfDrawRakePercent: club.selfDrawRakePercent },
      { startAt, endAt }
    )
    const agentSelfDrawRakeByPlayerId = new Map<string, number>()
    for (const binding of agentBindings) {
      agentSelfDrawRakeByPlayerId.set(
        binding.playerId,
        computeViewerSelfDrawRakeForRow(
          binding.playerId,
          binding.playerId,
          winByPlayer,
          poolByPlayer,
          agentBindings,
          upstreamBindings,
          rakePercent
        )
      )
    }

    // 代理即使區間內沒有戰績，也需要出現在 CSV 供應收/總結核對。
    for (const binding of agentBindings) {
      if (playerAggMap.has(binding.playerId)) continue
      const userId =
        typeof binding.player?.userId === 'string' && binding.player.userId.trim()
          ? binding.player.userId.trim()
          : '—'
      const nickname =
        typeof binding.player?.nickname === 'string' && binding.player.nickname.trim()
          ? binding.player.nickname.trim()
          : '未知玩家'
      playerAggMap.set(binding.playerId, {
        playerId: binding.playerId,
        userId,
        nickname,
        battleScore: 0,
        bigWinnerCount: 0,
        selfDrawCount: 0,
        roomCardConsumed: 0,
        completedGames: 0,
        dongMoney: 0,
        waterMoney: 0,
        selfDrawRakeMoney: 0,
      })
    }

    const roomCardConsumedByPlayer = new Map(
      Array.from(playerAggMap.values()).map((row) => [row.playerId, row.roomCardConsumed])
    )

    const directPlayerIdsByAgentId = new Map<string, string[]>()
    for (const binding of upstreamBindings) {
      if (agentPlayerIds.has(binding.playerId)) continue
      const list = directPlayerIdsByAgentId.get(binding.upstreamAgentPlayerId) ?? []
      list.push(binding.playerId)
      directPlayerIdsByAgentId.set(binding.upstreamAgentPlayerId, list)
    }

    const childAgentIdsByAgentId = new Map<string, string[]>()
    for (const binding of agentBindings) {
      if (!binding.upstreamAgentPlayerId) continue
      const list = childAgentIdsByAgentId.get(binding.upstreamAgentPlayerId) ?? []
      list.push(binding.playerId)
      childAgentIdsByAgentId.set(binding.upstreamAgentPlayerId, list)
    }

    const rowBases = Array.from(playerAggMap.values()).map((r) => {
      const agentBinding = agentBindingByPlayerId.get(r.playerId)
      const originalSelfDrawRakeAmount = roundMoney(r.selfDrawRakeMoney)
      const rakeAmount = roundMoney(
        agentBinding ? agentSelfDrawRakeByPlayerId.get(r.playerId) ?? 0 : originalSelfDrawRakeAmount
      )
      const effectiveRoomCardFee = resolveEffectiveRoomCardFee({
        clubRoomCardFee: club.roomCardFee,
        branchRoomCardEnabled: club.branchRoomCardEnabled,
        playerId: r.playerId,
        bindings: agentBindings,
        upstreamBindings,
        branchFees,
      })
      const roomCardFeeAmount = computeViewerRoomCardFeeForRow({
        targetPlayerId: r.playerId,
        roomCardConsumedByPlayer,
        bindings: agentBindings,
        upstreamBindings,
        clubRoomCardFee: club.roomCardFee,
        branchRoomCardEnabled: club.branchRoomCardEnabled,
        branchFees,
      })
      const payment = roundMoney(r.battleScore - originalSelfDrawRakeAmount)
      return {
        timeRange: `${startRaw} ~ ${endRaw}`,
        clubSixId: club.clubId,
        clubName: club.name,
        playerDisplay: `${r.nickname} (${r.userId})`,
        id: r.userId,
        nickname: r.nickname,
        title: agentBinding ? agentLevelLabelZh(agentBinding.agentLevel) : '玩家',
        agentLevel: agentBinding?.agentLevel ?? null,
        playerId: r.playerId,
        playerUserId: r.userId,
        playerNickname: r.nickname,
        battleScore: r.battleScore,
        payment,
        bigWinnerCount: r.bigWinnerCount,
        selfDrawCount: r.selfDrawCount,
        roomCardConsumed: r.roomCardConsumed,
        effectiveRoomCardFee,
        roomCardFeeAmount,
        completedGames: r.completedGames,
        dongMoney: Math.round(r.dongMoney),
        rakeAmount,
        selfDrawRakeMoney: originalSelfDrawRakeAmount,
        waterMoney: roundMoney(r.waterMoney),
        receivable: null as number | null,
        summary: null as number | null,
        upstreamAgent: '',
        csvSortOrder: Number.MAX_SAFE_INTEGER,
      }
    })

    const rowBaseByPlayerId = new Map(rowBases.map((row) => [row.playerId, row]))
    const paymentByPlayerId = new Map(rowBases.map((row) => [row.playerId, row.payment]))
    const upstreamBindingByPlayerId = new Map(upstreamBindings.map((binding) => [binding.playerId, binding]))
    const upstreamDisplay = (playerId: string | null | undefined): string => {
      if (!playerId) return ''
      const row = rowBaseByPlayerId.get(playerId)
      if (!row) return ''
      return `${row.nickname} (${row.id})`
    }

    for (const row of rowBases) {
      const agentBinding = agentBindingByPlayerId.get(row.playerId)
      const upstreamPlayerId =
        agentBinding?.upstreamAgentPlayerId ?? upstreamBindingByPlayerId.get(row.playerId)?.upstreamAgentPlayerId
      row.upstreamAgent = upstreamDisplay(upstreamPlayerId)
    }

    for (const row of rowBases) {
      const agentBinding = agentBindingByPlayerId.get(row.playerId)
      if (!agentBinding) {
        row.receivable = null
        continue
      }
      const directPlayerPayment = (directPlayerIdsByAgentId.get(row.playerId) ?? []).reduce(
        (sum, playerId) => sum + (paymentByPlayerId.get(playerId) ?? 0),
        0
      )
      row.receivable = roundMoney(row.payment + directPlayerPayment + row.rakeAmount)
    }

    function collectDescendantAgentIds(rootPlayerId: string): string[] {
      const descendants: string[] = []
      const stack = [...(childAgentIdsByAgentId.get(rootPlayerId) ?? [])]
      const seen = new Set<string>()
      while (stack.length) {
        const playerId = stack.pop()
        if (!playerId || seen.has(playerId)) continue
        seen.add(playerId)
        descendants.push(playerId)
        stack.push(...(childAgentIdsByAgentId.get(playerId) ?? []))
      }
      return descendants
    }

    for (const row of rowBases) {
      if (row.agentLevel !== 'master') continue
      const descendantReceivable = collectDescendantAgentIds(row.playerId).reduce(
        (sum, playerId) => sum + (rowBaseByPlayerId.get(playerId)?.receivable ?? 0),
        0
      )
      row.summary = roundMoney(row.receivable + descendantReceivable)
    }

    const displaySort = (a: { playerUserId: string; playerNickname: string }, b: { playerUserId: string; playerNickname: string }) => {
      const nicknameCompare = a.playerNickname.localeCompare(b.playerNickname, 'zh-Hant')
      if (nicknameCompare !== 0) return nicknameCompare
      return a.playerUserId.localeCompare(b.playerUserId)
    }
    const agentSort = (a: string, b: string) => {
      const rowA = rowBaseByPlayerId.get(a)
      const rowB = rowBaseByPlayerId.get(b)
      if (!rowA || !rowB) return a.localeCompare(b)
      const levelDiff = levelOrder(rowB.agentLevel) - levelOrder(rowA.agentLevel)
      if (levelDiff !== 0) return levelDiff
      return displaySort(rowA, rowB)
    }
    const playerSort = (a: string, b: string) => {
      const rowA = rowBaseByPlayerId.get(a)
      const rowB = rowBaseByPlayerId.get(b)
      if (!rowA || !rowB) return a.localeCompare(b)
      return displaySort(rowA, rowB)
    }
    const orderedForCsv: string[] = []
    const seenForCsv = new Set<string>()
    const pushForCsv = (playerId: string) => {
      if (seenForCsv.has(playerId) || !rowBaseByPlayerId.has(playerId)) return
      seenForCsv.add(playerId)
      orderedForCsv.push(playerId)
    }
    const insertAfterParentForCsv = (parentPlayerId: string, childPlayerIds: string[]) => {
      const parentIndex = orderedForCsv.indexOf(parentPlayerId)
      if (parentIndex < 0) return
      for (const childPlayerId of [...childPlayerIds].reverse()) {
        if (seenForCsv.has(childPlayerId) || !rowBaseByPlayerId.has(childPlayerId)) continue
        seenForCsv.add(childPlayerId)
        orderedForCsv.splice(parentIndex + 1, 0, childPlayerId)
      }
    }
    const insertGroupedUnderParentsForCsv = (
      groups: Map<string, string[]>,
      sortFn: (a: string, b: string) => number
    ) => {
      for (const parentPlayerId of [...orderedForCsv].reverse()) {
        const childPlayerIds = [...(groups.get(parentPlayerId) ?? [])]
          .filter((playerId) => !seenForCsv.has(playerId))
          .sort(sortFn)
        insertAfterParentForCsv(parentPlayerId, childPlayerIds)
      }
    }
    const rootAgentIds = agentBindings
      .filter((binding) => binding.agentLevel === 'super' || !binding.upstreamAgentPlayerId)
      .map((binding) => binding.playerId)
      .sort(agentSort)
    for (const rootPlayerId of rootAgentIds) {
      pushForCsv(rootPlayerId)
    }

    const csvAgentLevels = ['master', 'mid', 'small', 'agent', 'dealer', 'distributor', 'promoter']
    for (const level of csvAgentLevels) {
      const groups = new Map<string, string[]>()
      for (const binding of agentBindings) {
        if (binding.agentLevel !== level || !binding.upstreamAgentPlayerId) continue
        const list = groups.get(binding.upstreamAgentPlayerId) ?? []
        list.push(binding.playerId)
        groups.set(binding.upstreamAgentPlayerId, list)
      }
      insertGroupedUnderParentsForCsv(groups, agentSort)
    }

    insertGroupedUnderParentsForCsv(directPlayerIdsByAgentId, playerSort)

    const remainingRowIds = rowBases
      .map((row) => row.playerId)
      .filter((playerId) => !seenForCsv.has(playerId))
      .sort((a, b) => {
        const rowA = rowBaseByPlayerId.get(a)
        const rowB = rowBaseByPlayerId.get(b)
        if (!rowA || !rowB) return a.localeCompare(b)
        if (rowA.agentLevel && rowB.agentLevel) return agentSort(a, b)
        if (rowA.agentLevel) return -1
        if (rowB.agentLevel) return 1
        return playerSort(a, b)
      })
    for (const playerId of remainingRowIds) {
      pushForCsv(playerId)
    }
    orderedForCsv.forEach((playerId, index) => {
      const row = rowBaseByPlayerId.get(playerId)
      if (row) row.csvSortOrder = index
    })

    const rows = rowBases
      .sort((a, b) => {
        if (b.battleScore !== a.battleScore) return b.battleScore - a.battleScore
        if (b.completedGames !== a.completedGames) return b.completedGames - a.completedGames
        if (b.bigWinnerCount !== a.bigWinnerCount) return b.bigWinnerCount - a.bigWinnerCount
        return a.playerUserId.localeCompare(b.playerUserId)
      })

    const totals = rows.reduce(
      (acc, row) => {
        acc.playerCount += 1
        acc.totalBattleScore += row.battleScore
        acc.totalSelfDrawCount += row.selfDrawCount
        acc.totalRoomCardConsumed += row.roomCardConsumed
        acc.totalRoomCardFeeAmount += row.roomCardFeeAmount
        acc.totalCompletedGames += row.completedGames
        acc.totalDongMoney += row.dongMoney
        acc.totalSelfDrawRakeMoney += row.selfDrawRakeMoney
        acc.totalWaterMoney += row.waterMoney
        return acc
      },
      {
        playerCount: 0,
        totalBattleScore: 0,
        totalSelfDrawCount: 0,
        totalRoomCardConsumed: 0,
        totalRoomCardFeeAmount: 0,
        totalCompletedGames: 0,
        totalDongMoney: 0,
        totalSelfDrawRakeMoney: 0,
        totalWaterMoney: 0,
      }
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          rows,
          totals,
          filter: { startDate: startRaw, endDate: endRaw, clubId: clubSixId },
          club: {
            clubInternalId: club.id,
            clubSixId: club.clubId,
            clubName: club.name,
            venueDrawPercent:
              typeof club.venueDrawPercent === 'number' && Number.isFinite(club.venueDrawPercent)
                ? club.venueDrawPercent
                : DEFAULT_VENUE_DRAW_PERCENT,
            selfDrawRakePercent:
              typeof club.selfDrawRakePercent === 'number' && Number.isFinite(club.selfDrawRakePercent)
                ? club.selfDrawRakePercent
                : DEFAULT_SELF_DRAW_RAKE_PERCENT,
            roomCardFee:
              typeof club.roomCardFee === 'number' && Number.isFinite(club.roomCardFee)
                ? club.roomCardFee
                : 2,
            branchRoomCardEnabled: club.branchRoomCardEnabled === true,
          },
        },
      },
      { headers: corsHeaders() }
    )
  } catch (error) {
    console.error('[Admin] reports/club-summary GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: '取得俱樂部報表失敗',
        message: error instanceof Error ? error.message : '未知錯誤',
      },
      { status: 500, headers: corsHeaders() }
    )
  }
}
