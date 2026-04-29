import type { PrismaClient } from '@prisma/client'

/** V2 局序由 1 起；以「列數」與「最大 roundIndex」取較大者，避免資料缺口時列表局數過小 */
export function playedRoundCountFromV2Rounds(
  rounds: { roundIndex: number }[] | null | undefined
): number {
  if (!rounds?.length) return 0
  let maxIdx = 0
  for (const r of rounds) {
    const n = Number(r.roundIndex)
    if (Number.isFinite(n) && n > maxIdx) maxIdx = n
  }
  return Math.max(rounds.length, maxIdx)
}

const LINK_MAX_MS = 48 * 60 * 60 * 1000

/**
 * 依俱樂部結算列對應之 V2 session（同房號／同 roomInternalId、結束時間最接近）。
 * 用於後台詳情附加各局 shareCode，以及結算列「實際局數」覆寫。
 */
export async function findLinkedV2SessionForClubGameResult(
  prisma: PrismaClient,
  row: {
    clubId: string
    roomId: string
    roomInternalId: string | null
    endedAt: Date
  }
) {
  const candidates = await prisma.v2MatchSession.findMany({
    where: {
      clubId: row.clubId,
      roomCode: row.roomId,
      ...(row.roomInternalId ? { roomInternalId: row.roomInternalId } : {}),
    },
    include: {
      rounds: {
        select: { id: true, roundIndex: true, shareCode: true },
        orderBy: { roundIndex: 'asc' },
      },
    },
    orderBy: [{ endedAt: 'desc' }],
    take: 30,
  })
  if (!candidates.length) return null

  const target = row.endedAt.getTime()
  let best = candidates[0]!
  let bestDiff = Infinity
  for (const s of candidates) {
    const endMs = (s.endedAt ?? s.startedAt).getTime()
    const diff = Math.abs(endMs - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  if (bestDiff > LINK_MAX_MS) return null
  return best
}

export async function batchPlayedRoundCountsForClubSettlements(
  prisma: PrismaClient,
  settlements: {
    id: string
    clubId: string
    roomId: string
    roomInternalId: string | null
    endedAt: Date
  }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const internals = [...new Set(settlements.map((s) => s.roomInternalId).filter(Boolean) as string[])]
  if (!internals.length) return out

  const sessions = await prisma.v2MatchSession.findMany({
    where: { roomInternalId: { in: internals } },
    select: {
      roomInternalId: true,
      endedAt: true,
      startedAt: true,
      rounds: { select: { roundIndex: true } },
    },
  })

  const grouped = new Map<string, typeof sessions>()
  for (const s of sessions) {
    if (!s.roomInternalId) continue
    const arr = grouped.get(s.roomInternalId) ?? []
    arr.push(s)
    grouped.set(s.roomInternalId, arr)
  }

  for (const row of settlements) {
    if (!row.roomInternalId) continue
    const cands = grouped.get(row.roomInternalId) ?? []
    if (!cands.length) continue
    const target = row.endedAt.getTime()
    let best = cands[0]!
    let bestDiff = Infinity
    for (const c of cands) {
      const d = Math.abs((c.endedAt ?? c.startedAt).getTime() - target)
      if (d < bestDiff) {
        bestDiff = d
        best = c
      }
    }
    if (bestDiff <= LINK_MAX_MS) {
      const n = playedRoundCountFromV2Rounds(best.rounds)
      if (n > 0) out.set(row.id, n)
    }
  }
  return out
}

/**
 * 同一房間可有多場對局（roomInternalId 相同）。
 * 僅當「本場 DISBANDED session」與某筆結算列時間對齊（同一場但 session 未改 FINISHED 的幽靈列）時去重。
 *
 * 必須排除「結算 endedAt 早於本場 startedAt」的結算列，否則易誤把上一局全局完結當成重複，而錯誤隱藏真正的中途解散。
 */
export function isDisbandedDuplicateOfClubSettlement(
  session: {
    status: string
    roomInternalId: string | null
    startedAt: Date
    endedAt: Date | null
  },
  settlements: { roomInternalId: string | null; endedAt: Date }[],
  /** 結算寫入與 PATCH session 之間允許的誤差 */
  windowMs = 6 * 60 * 1000
): boolean {
  if (session.status !== 'DISBANDED' || !session.roomInternalId || !session.endedAt) return false
  const sessionStart = session.startedAt.getTime()
  const sessionEnd = session.endedAt.getTime()
  const startSlackMs = 15 * 1000
  for (const cgr of settlements) {
    if (!cgr.roomInternalId || cgr.roomInternalId !== session.roomInternalId) continue
    const settled = cgr.endedAt.getTime()
    if (settled < sessionStart - startSlackMs) continue
    if (Math.abs(settled - sessionEnd) <= windowMs) return true
  }
  return false
}
