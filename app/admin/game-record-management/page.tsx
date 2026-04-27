'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw,
  Search,
  Eye,
  Copy,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  Filter,
} from 'lucide-react'
import { apiGet } from '@/lib/api-client'

type RecordTab = 'club' | 'general'

interface ClubClub {
  id: string
  clubId: string
  name: string
}

interface ClubListItem {
  id: string
  roomId: string
  roomInternalId: string | null
  multiplayerVersion: string
  totalRounds: number
  deduction: string
  roomCardConsumedTotal: number
  bigWinnerPlayerIds: string[]
  bigWinnerLabels: string[]
  scoreLine: string
  playerSummaries: {
    playerId: string
    userId: string | null
    nickname: string
    seat: number | null
    score: number
    isBigWinner: boolean
    roomCardConsumed: number
    rank: number | null
  }[]
  endedAt: string | null
  createdAt: string
  club: ClubClub
  listRowKind?: 'settlement' | 'session'
  recordCategory?: string
  recordCategoryLabel?: string
}

interface GeneralListItem {
  id: string
  roomCode: string
  roomInternalId: string | null
  hostPlayerId: string
  status: string
  multiplayerVersion: string
  gameTypeLabel: string
  startedAt: string
  endedAt: string | null
  roundCount: number
  replayCodes: string[]
  lastReplayCode: string | null
  players: {
    playerId: string
    userId: string | null
    nickname: string
    avatarUrl: string | null
    seat: number
    isHost: boolean
    matchTotalScore: number
  }[]
  bigWinnerPlayerIds: string[]
  /** 後台分類：COMPLETED_FULL | DISBANDED_MID | LIVE | ERROR */
  recordCategory?: string
  recordCategoryLabel?: string
}

function formatDate(date: string | Date | null | undefined) {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 俱樂部結算：與 App（clubs.js 規則摘要）一致，HOST/CLUB 皆為俱樂部扣卡語意 */
function deductionLabel(d: string) {
  if (d === 'AA_DEDUCTION') return 'AA 制'
  if (d === 'HOST_DEDUCTION' || d === 'CLUB_DEDUCTION') return '俱樂部扣除'
  return d || '—'
}

type RecordCategoryBadgeRow = {
  recordCategory?: string
  recordCategoryLabel?: string
  status?: string
}

/** 依後台戰績分類顯示徽章（與下拉篩選語意一致；一般／俱樂部共用） */
function recordCategoryBadge(row: RecordCategoryBadgeRow) {
  const c = row.recordCategory
  if (c === 'COMPLETED_FULL')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-900">
        {row.recordCategoryLabel || '全局完結'}
      </span>
    )
  if (c === 'DISBANDED_MID')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
        {row.recordCategoryLabel || '中途解散'}
      </span>
    )
  if (c === 'LIVE')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-950 ring-1 ring-amber-300/60">
        {row.recordCategoryLabel || '進行中'}
      </span>
    )
  if (c === 'ERROR')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-900">
        {row.recordCategoryLabel || '錯誤戰績'}
      </span>
    )
  const s = row.status?.toUpperCase() || ''
  if (s === 'FINISHED')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        已結束
      </span>
    )
  if (s === 'DISBANDED')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        已解散
      </span>
    )
  if (s === 'IN_PROGRESS')
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
        進行中
      </span>
    )
  return <span className="text-gray-600 text-xs">{row.status}</span>
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    window.prompt('複製以下內容：', text)
  }
}

const GR_UI_KEY = 'mojan_admin_game_record_ui_v1'

const defaultClubDraft = {
  keyword: '',
  clubSixId: '',
  version: 'ALL' as const,
  deduction: 'ALL' as const,
  recordCategory: 'ALL' as const,
  start: '',
  end: '',
}

const defaultGenDraft = {
  keyword: '',
  status: 'ALL' as const,
  start: '',
  end: '',
}

export default function GameRecordManagementPage() {
  const [uiReady, setUiReady] = useState(false)
  const [tab, setTab] = useState<RecordTab>('club')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [clubItems, setClubItems] = useState<ClubListItem[]>([])
  const [clubTotal, setClubTotal] = useState(0)
  const [generalItems, setGeneralItems] = useState<GeneralListItem[]>([])
  const [generalTotal, setGeneralTotal] = useState(0)
  const [liveLobbyRoomCount, setLiveLobbyRoomCount] = useState<number | null>(null)
  const [liveClubPlayingRoomCount, setLiveClubPlayingRoomCount] = useState<number | null>(null)

  const [page, setPage] = useState(1)
  const pageSize = 20

  const [clubDraft, setClubDraft] = useState({ ...defaultClubDraft })
  const [clubApplied, setClubApplied] = useState({ ...defaultClubDraft })

  const [genDraft, setGenDraft] = useState({ ...defaultGenDraft })
  const [genApplied, setGenApplied] = useState({ ...defaultGenDraft })

  const [detailClub, setDetailClub] = useState<Record<string, unknown> | null>(null)
  const [detailGeneral, setDetailGeneral] = useState<Record<string, unknown> | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GR_UI_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>
        if (p.tab === 'club' || p.tab === 'general') setTab(p.tab)
        if (typeof p.page === 'number' && p.page >= 1) setPage(p.page)
        const ca = p.clubApplied as typeof defaultClubDraft | undefined
        if (ca && typeof ca === 'object') {
          const merged = { ...defaultClubDraft, ...ca }
          setClubApplied(merged)
          setClubDraft(merged)
        }
        const ga = p.genApplied as typeof defaultGenDraft | undefined
        if (ga && typeof ga === 'object') {
          const merged = { ...defaultGenDraft, ...ga }
          setGenApplied(merged)
          setGenDraft(merged)
        }
      }
    } catch {
      /* ignore */
    }
    setUiReady(true)
  }, [])

  useEffect(() => {
    if (!uiReady) return
    sessionStorage.setItem(
      GR_UI_KEY,
      JSON.stringify({
        tab,
        page,
        clubApplied,
        genApplied,
      })
    )
  }, [uiReady, tab, page, clubApplied, genApplied])

  const buildClubQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    const f = clubApplied
    if (f.keyword.trim()) q.set('keyword', f.keyword.trim())
    if (f.clubSixId.trim()) q.set('clubSixId', f.clubSixId.trim())
    if (f.version !== 'ALL') q.set('version', f.version)
    if (f.deduction !== 'ALL') q.set('deduction', f.deduction)
    if (f.recordCategory !== 'ALL') q.set('recordCategory', f.recordCategory)
    if (f.start) q.set('startDate', f.start)
    if (f.end) q.set('endDate', f.end)
    return q.toString()
  }, [page, pageSize, clubApplied])

  const buildGeneralQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    const f = genApplied
    if (f.keyword.trim()) q.set('keyword', f.keyword.trim())
    if (f.status !== 'ALL') q.set('status', f.status)
    if (f.start) q.set('startDate', f.start)
    if (f.end) q.set('endDate', f.end)
    return q.toString()
  }, [page, pageSize, genApplied])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'club') {
        const res = await apiGet(`/api/admin/game-records/club?${buildClubQuery()}`)
        const json = await res.json()
        if (json.success && json.data) {
          setClubItems(json.data.items || [])
          setClubTotal(json.data.total ?? 0)
          if (typeof json.data.liveClubPlayingRoomCount === 'number') {
            setLiveClubPlayingRoomCount(json.data.liveClubPlayingRoomCount)
          } else {
            setLiveClubPlayingRoomCount(null)
          }
        }
      } else {
        const res = await apiGet(`/api/admin/game-records/general?${buildGeneralQuery()}`)
        const json = await res.json()
        if (json.success && json.data) {
          setGeneralItems(json.data.items || [])
          setGeneralTotal(json.data.total ?? 0)
          if (typeof json.data.liveLobbyRoomCount === 'number') {
            setLiveLobbyRoomCount(json.data.liveLobbyRoomCount)
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [tab, buildClubQuery, buildGeneralQuery])

  useEffect(() => {
    if (!uiReady) return
    fetchList()
  }, [uiReady, fetchList])

  /** 「進行中」分類：依大廳房間 PLAYING 連動，約每 12 秒同步列表（不觸發全頁 loading） */
  useEffect(() => {
    if (tab !== 'general' || genApplied.status !== 'LIVE') {
      return undefined
    }

    const run = async () => {
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      if (genApplied.keyword.trim()) q.set('keyword', genApplied.keyword.trim())
      if (genApplied.status !== 'ALL') q.set('status', genApplied.status)
      if (genApplied.start) q.set('startDate', genApplied.start)
      if (genApplied.end) q.set('endDate', genApplied.end)
      try {
        const res = await apiGet(`/api/admin/game-records/general?${q.toString()}`)
        const json = await res.json()
        if (json.success && json.data) {
          setGeneralItems(json.data.items || [])
          setGeneralTotal(json.data.total ?? 0)
          if (typeof json.data.liveLobbyRoomCount === 'number') {
            setLiveLobbyRoomCount(json.data.liveLobbyRoomCount)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    const id = window.setInterval(run, 12000)
    return () => window.clearInterval(id)
  }, [tab, genApplied, page, pageSize])

  /** 俱樂部「進行中」：約每 12 秒同步列表 */
  useEffect(() => {
    if (tab !== 'club' || clubApplied.recordCategory !== 'LIVE') {
      return undefined
    }

    const run = async () => {
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      if (clubApplied.keyword.trim()) q.set('keyword', clubApplied.keyword.trim())
      if (clubApplied.clubSixId.trim()) q.set('clubSixId', clubApplied.clubSixId.trim())
      if (clubApplied.version !== 'ALL') q.set('version', clubApplied.version)
      if (clubApplied.deduction !== 'ALL') q.set('deduction', clubApplied.deduction)
      q.set('recordCategory', 'LIVE')
      if (clubApplied.start) q.set('startDate', clubApplied.start)
      if (clubApplied.end) q.set('endDate', clubApplied.end)
      try {
        const res = await apiGet(`/api/admin/game-records/club?${q.toString()}`)
        const json = await res.json()
        if (json.success && json.data) {
          setClubItems(json.data.items || [])
          setClubTotal(json.data.total ?? 0)
          if (typeof json.data.liveClubPlayingRoomCount === 'number') {
            setLiveClubPlayingRoomCount(json.data.liveClubPlayingRoomCount)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    const id = window.setInterval(run, 12000)
    return () => window.clearInterval(id)
  }, [tab, clubApplied, page, pageSize])

  const total = tab === 'club' ? clubTotal : generalTotal
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const openClubDetail = async (id: string) => {
    setDetailClub(null)
    setDetailGeneral(null)
    setDetailLoading(true)
    try {
      const res = await apiGet(`/api/admin/game-records/club/${id}`)
      const json = await res.json()
      if (json.success) setDetailClub(json.data)
    } finally {
      setDetailLoading(false)
    }
  }

  const openGeneralDetail = async (id: string) => {
    setDetailClub(null)
    setDetailGeneral(null)
    setDetailLoading(true)
    try {
      const res = await apiGet(`/api/admin/game-records/general/${id}`)
      const json = await res.json()
      if (json.success) setDetailGeneral(json.data)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetailClub(null)
    setDetailGeneral(null)
  }

  const applyClubFilters = () => {
    setClubApplied({ ...clubDraft })
    setPage(1)
  }

  const applyGeneralFilters = () => {
    setGenApplied({ ...genDraft })
    setPage(1)
  }

  /** 篩選列：固定高度與字級，與下拉、按鈕對齊 */
  const fc =
    'h-10 min-h-[2.5rem] box-border rounded-md border border-gray-300 text-sm leading-5 text-gray-900'
  const fcFocus = 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
  const filterSearchInput = `w-full pl-10 pr-3 ${fc} bg-white placeholder:text-gray-500 ${fcFocus}`
  /** 俱樂部 6 碼（額外限定）— 略寬以容納 placeholder */
  const filterClubSixInput = `w-52 shrink-0 px-3 sm:w-60 md:w-64 ${fc} bg-white placeholder:text-gray-500 ${fcFocus}`
  const filterSelect = `shrink-0 px-3 ${fc} bg-white ${fcFocus}`
  const filterDate = `shrink-0 min-w-[10.5rem] px-3 ${fc} bg-white [color-scheme:light] ${fcFocus}`
  const filterApplyBtn =
    'h-10 min-h-[2.5rem] shrink-0 inline-flex items-center justify-center rounded-md border border-transparent bg-slate-700 px-4 text-sm font-medium leading-5 text-white hover:bg-slate-800 ' + fcFocus

  return (
    <div className="p-6 text-gray-900">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">遊戲紀錄管理</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-3xl">
              檢視已落庫的對戰資料。俱樂部來源為房間結算寫入的戰績摘要；一般玩家為大廳開房、非俱樂部綁定的 V2
              對局，戰績分類含全局完結、中途解散、進行中（連動大廳房間對局狀態）、錯誤戰績等。可依關鍵字、日期篩選，詳情可檢視
              JSON 與重播分享碼。
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchList()}
            disabled={loading}
            className="inline-flex h-10 min-h-[2.5rem] shrink-0 items-center justify-center gap-1.5 rounded-md bg-blue-500 px-4 text-sm font-medium leading-5 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 pb-4 border-b border-gray-100">
          <label className="h-10 min-h-[2.5rem] text-sm font-medium text-gray-700 inline-flex items-center gap-1.5 shrink-0">
            <Filter className="w-4 h-4 text-gray-500 shrink-0" />
            紀錄類型
          </label>
          <select
            value={tab}
            onChange={(e) => {
              setTab(e.target.value as RecordTab)
              setPage(1)
            }}
            className={`min-w-[220px] ${filterSelect}`}
          >
            <option value="club">俱樂部對戰紀錄</option>
            <option value="general">一般玩家對戰紀錄</option>
          </select>
          {tab === 'club' ? (
            <span className="text-sm text-gray-500 inline-flex items-center gap-1.5 min-h-10">
              <Building2 className="w-4 h-4 shrink-0 text-gray-400" />
              依戰績分類：結算為 ClubGameResult；中途解散／進行中為俱樂部 V2 MatchSession
            </span>
          ) : (
            <span className="text-sm text-gray-500 inline-flex items-center gap-1.5 min-h-10">
              <Users className="w-4 h-4 shrink-0 text-gray-400" />
              資料表：V2MatchSession（clubId 為空）
            </span>
          )}
        </div>

        {tab === 'club' ? (
          <div className="mb-4 flex flex-wrap gap-3 items-center">
            <div className="relative w-full shrink-0 sm:w-72 md:w-96 lg:w-[28rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="關鍵字：房號、俱樂部 6 碼、俱樂部名稱…"
                value={clubDraft.keyword}
                onChange={(e) => setClubDraft((d) => ({ ...d, keyword: e.target.value }))}
                className={filterSearchInput}
              />
            </div>
            <input
              type="text"
              placeholder="俱樂部 6 碼（額外限定）"
              value={clubDraft.clubSixId}
              onChange={(e) => setClubDraft((d) => ({ ...d, clubSixId: e.target.value }))}
              className={filterClubSixInput}
            />
            <select
              value={clubDraft.version}
              onChange={(e) => setClubDraft((d) => ({ ...d, version: e.target.value }))}
              className={filterSelect}
            >
              <option value="ALL">版本：全部</option>
              <option value="V1">V1</option>
              <option value="V2">V2</option>
            </select>
            <select
              value={clubDraft.deduction}
              onChange={(e) => setClubDraft((d) => ({ ...d, deduction: e.target.value }))}
              className={filterSelect}
            >
              <option value="ALL">扣卡：全部</option>
              <option value="AA_DEDUCTION">AA 制</option>
              <option value="CLUB">俱樂部扣除</option>
            </select>
            <select
              value={clubDraft.recordCategory}
              onChange={(e) => setClubDraft((d) => ({ ...d, recordCategory: e.target.value }))}
              className={`min-w-[10rem] ${filterSelect}`}
            >
              <option value="ALL">戰績分類：全部</option>
              <option value="COMPLETED_FULL">全局完結</option>
              <option value="DISBANDED_MID">中途解散</option>
              <option value="LIVE">進行中</option>
              <option value="ERROR">錯誤戰績</option>
            </select>
            <input
              type="date"
              value={clubDraft.start}
              onChange={(e) => setClubDraft((d) => ({ ...d, start: e.target.value }))}
              className={filterDate}
            />
            <span className="inline-flex h-10 min-h-[2.5rem] items-center text-sm font-medium leading-5 text-gray-600 shrink-0">
              至
            </span>
            <input
              type="date"
              value={clubDraft.end}
              onChange={(e) => setClubDraft((d) => ({ ...d, end: e.target.value }))}
              className={filterDate}
            />
            <button type="button" onClick={applyClubFilters} className={filterApplyBtn}>
              套用篩選
            </button>
          </div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-3 items-center">
            <div className="relative w-full shrink-0 sm:w-72 md:w-96 lg:w-[28rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="關鍵字：房號、玩家 6 碼、暱稱…"
                value={genDraft.keyword}
                onChange={(e) => setGenDraft((d) => ({ ...d, keyword: e.target.value }))}
                className={filterSearchInput}
              />
            </div>
            <select
              value={genDraft.status}
              onChange={(e) => setGenDraft((d) => ({ ...d, status: e.target.value }))}
              className={`min-w-[10rem] ${filterSelect}`}
            >
              <option value="ALL">戰績分類：全部</option>
              <option value="COMPLETED_FULL">全局完結</option>
              <option value="DISBANDED_MID">中途解散</option>
              <option value="LIVE">進行中</option>
              <option value="ERROR">錯誤戰績</option>
            </select>
            <input
              type="date"
              value={genDraft.start}
              onChange={(e) => setGenDraft((d) => ({ ...d, start: e.target.value }))}
              className={filterDate}
            />
            <span className="inline-flex h-10 min-h-[2.5rem] items-center text-sm font-medium leading-5 text-gray-600 shrink-0">
              至
            </span>
            <input
              type="date"
              value={genDraft.end}
              onChange={(e) => setGenDraft((d) => ({ ...d, end: e.target.value }))}
              className={filterDate}
            />
            <button type="button" onClick={applyGeneralFilters} className={filterApplyBtn}>
              套用篩選
            </button>
          </div>
        )}

        {tab === 'general' && genApplied.status === 'LIVE' && (
          <p className="text-xs text-gray-600 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-amber-900/90">進行中</span>
            <span>
              列表會約每 12 秒自動同步；僅列出 session 仍為進行中、且對應大廳房間目前為「對局中（PLAYING）」的戰績。
            </span>
            {liveLobbyRoomCount !== null && (
              <span className="text-gray-500">
                目前大廳對局中房間數：<strong className="text-gray-800">{liveLobbyRoomCount}</strong>
              </span>
            )}
          </p>
        )}

        {tab === 'club' && clubApplied.recordCategory === 'LIVE' && (
          <p className="text-xs text-gray-600 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-amber-900/90">進行中</span>
            <span>
              列表會約每 12 秒自動同步；僅列出俱樂部 session 仍為進行中、且對應俱樂部房目前為「對局中（PLAYING）」的戰績。
            </span>
            {liveClubPlayingRoomCount !== null && (
              <span className="text-gray-500">
                目前俱樂部對局中房間數：
                <strong className="text-gray-800">{liveClubPlayingRoomCount}</strong>
              </span>
            )}
          </p>
        )}

        <div className="text-sm text-gray-500 mb-2">
          共 {total} 筆
          {loading ? '（載入中…）' : ''}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            {tab === 'club' ? (
              <table className="w-full min-w-[1300px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 w-14">
                      #
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      戰績分類
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      結束時間
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      俱樂部
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      房號
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200">
                      版本 / 局數
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      扣卡
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      房卡消耗
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[200px]">
                      四位成績摘要
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[120px]">
                      大贏家
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap w-28">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {!loaded && loading ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                        載入中…
                      </td>
                    </tr>
                  ) : clubItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-6 py-8 text-center text-gray-500">
                        沒有符合條件的紀錄
                      </td>
                    </tr>
                  ) : (
                    clubItems.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center text-sm text-gray-600 border-r border-gray-200">
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-gray-200">
                          {recordCategoryBadge(row)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200 whitespace-nowrap">
                          {formatDate(row.endedAt)}
                        </td>
                        <td className="px-4 py-3 text-sm border-r border-gray-200">
                          <div className="font-medium text-gray-900">{row.club.name}</div>
                          <div className="text-xs text-gray-500">6 碼：{row.club.clubId}</div>
                        </td>
                        <td className="px-4 py-3 text-center border-r border-gray-200">
                          <button
                            type="button"
                            onClick={() => copyText(row.roomId)}
                            className="text-sm font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                            title="複製房號"
                          >
                            {row.roomId}
                            <Copy className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200">
                          <span>{row.multiplayerVersion}</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span>{row.totalRounds} 局</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200 whitespace-nowrap">
                          {deductionLabel(row.deduction)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200">
                          {row.roomCardConsumedTotal}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 border-r border-gray-200 font-mono leading-relaxed">
                          {row.scoreLine || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 border-r border-gray-200">
                          {row.bigWinnerLabels.length ? row.bigWinnerLabels.join('、') : '—'}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-gray-200">
                          <button
                            type="button"
                            onClick={() =>
                              row.listRowKind === 'session'
                                ? openGeneralDetail(row.id)
                                : openClubDetail(row.id)
                            }
                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            詳情
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 w-14">
                      #
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      戰績分類
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      房號
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      玩法
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      開始
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200 whitespace-nowrap">
                      結束
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200">
                      局數
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[220px]">
                      玩家（座位 / 總分 / 房主）
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-200 min-w-[100px]">
                      末局重播碼
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap w-36">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {!loaded && loading ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                        載入中…
                      </td>
                    </tr>
                  ) : generalItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                        沒有符合條件的紀錄
                      </td>
                    </tr>
                  ) : (
                    generalItems.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-center text-sm text-gray-600 border-r border-gray-200">
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-gray-200">
                          {recordCategoryBadge(row)}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-gray-200">
                          <button
                            type="button"
                            onClick={() => copyText(row.roomCode)}
                            className="text-sm font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                          >
                            {row.roomCode}
                            <Copy className="w-3 h-3 opacity-60" />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200 whitespace-nowrap">
                          {row.gameTypeLabel}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-700 border-r border-gray-200 whitespace-nowrap">
                          {formatDate(row.startedAt)}
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-700 border-r border-gray-200 whitespace-nowrap">
                          {formatDate(row.endedAt)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-800 border-r border-gray-200">
                          {row.roundCount}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-800 border-r border-gray-200">
                          <div className="flex flex-col gap-1">
                            {[...row.players]
                              .sort((a, b) => a.seat - b.seat)
                              .map((p) => (
                                <div key={p.playerId} className="flex flex-wrap items-center gap-x-2">
                                  <span className="text-gray-500">
                                    {'東南西北'.charAt(Math.min(3, Math.max(0, p.seat))) || '?'}
                                  </span>
                                  <span className="font-medium">{p.nickname}</span>
                                  <span className="text-gray-500">
                                    （{p.userId || `${p.playerId.slice(0, 8)}…`}）
                                  </span>
                                  <span
                                    className={
                                      row.bigWinnerPlayerIds.includes(p.playerId)
                                        ? 'text-amber-700 font-semibold'
                                        : ''
                                    }
                                  >
                                    {p.matchTotalScore} 分
                                  </span>
                                  {p.isHost && (
                                    <span className="text-[10px] px-1 rounded bg-violet-100 text-violet-800">
                                      房主
                                    </span>
                                  )}
                                </div>
                              ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono border-r border-gray-200">
                          {row.lastReplayCode ? (
                            <button
                              type="button"
                              onClick={() => copyText(row.lastReplayCode!)}
                              className="text-blue-700 hover:underline break-all text-left"
                            >
                              {row.lastReplayCode}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <button
                              type="button"
                              onClick={() => openGeneralDetail(row.id)}
                              className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm"
                            >
                              <Eye className="w-4 h-4" />
                              詳情
                            </button>
                            <button
                              type="button"
                              onClick={() => copyText(row.id)}
                              className="text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 text-xs"
                            >
                              <Copy className="w-3 h-3" />
                              Session ID
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            第 {page} / {totalPages} 頁
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              上一頁
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-40"
            >
              下一頁
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {(detailClub || detailGeneral || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 text-gray-900">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col text-gray-900 [color-scheme:light]">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center shrink-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">
                {detailClub ? '俱樂部對戰詳情' : detailGeneral ? '一般對戰詳情' : '載入中…'}
              </h3>
              <button
                type="button"
                onClick={closeDetail}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 text-sm text-gray-900 bg-white">
              {detailLoading && (
                <p className="text-gray-600 py-8 text-center">載入詳情…</p>
              )}
              {!detailLoading && detailClub && (
                <div className="space-y-3 text-gray-900">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-gray-600 text-xs font-medium">紀錄 ID</div>
                      <div className="font-mono text-xs break-all flex items-start gap-2 text-gray-900">
                        {String(detailClub.id)}
                        <button
                          type="button"
                          onClick={() => copyText(String(detailClub.id))}
                          className="text-blue-600 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">房號</div>
                      <div className="text-gray-900">{String(detailClub.roomId)}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">俱樂部</div>
                      <div className="text-gray-900">
                        {(detailClub.club as { name?: string })?.name ?? '—'}（
                        {(detailClub.club as { clubId?: string })?.clubId ?? '—'}）
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">結束時間</div>
                      <div className="text-gray-900">{formatDate(detailClub.endedAt as string)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 text-xs font-medium mb-1">scoresBySeat（原始 JSON）</div>
                    <pre className="text-xs text-gray-800 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-40">
                      {JSON.stringify(detailClub.scoresBySeat ?? null, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-gray-600 text-xs font-medium mb-1">players（原始 JSON）</div>
                    <pre className="text-xs text-gray-800 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-60">
                      {JSON.stringify(detailClub.players ?? null, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              {!detailLoading && detailGeneral && (
                <div className="space-y-3 text-gray-900">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-gray-600 text-xs font-medium">Session ID</div>
                      <div className="font-mono text-xs break-all flex items-start gap-2 text-gray-900">
                        {String(detailGeneral.id)}
                        <button
                          type="button"
                          onClick={() => copyText(String(detailGeneral.id))}
                          className="text-blue-600 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">房號 / 狀態</div>
                      <div className="text-gray-900">
                        {String(detailGeneral.roomCode)} · {String(detailGeneral.status)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">時間</div>
                      <div className="text-gray-900">
                        {formatDate(detailGeneral.startedAt as string)} →{' '}
                        {formatDate(detailGeneral.endedAt as string | null)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-xs font-medium">房主 playerId</div>
                      <div className="font-mono text-xs break-all text-gray-900">
                        {String(detailGeneral.hostPlayerId)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 text-xs font-medium mb-1">參與者</div>
                    <pre className="text-xs text-gray-800 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-48">
                      {JSON.stringify(detailGeneral.participants ?? [], null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-gray-600 text-xs font-medium mb-1">各局重播分享碼（shareCode）</div>
                    <ul className="text-xs text-gray-800 space-y-1 font-mono bg-gray-50 p-3 rounded border border-gray-200 max-h-48 overflow-y-auto">
                      {Array.isArray(detailGeneral.rounds) &&
                        (detailGeneral.rounds as { roundIndex?: number; shareCode?: string | null }[]).map(
                          (r) => (
                            <li
                              key={r.roundIndex}
                              className="flex justify-between gap-2 border-b border-gray-200 pb-1 text-gray-800"
                            >
                              <span>第 {r.roundIndex} 局</span>
                              <span className="flex items-center gap-2">
                                {r.shareCode || '—'}
                                {r.shareCode && (
                                  <button
                                    type="button"
                                    onClick={() => copyText(String(r.shareCode))}
                                    className="text-blue-600"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                              </span>
                            </li>
                          )
                        )}
                    </ul>
                  </div>
                  <div>
                    <div className="text-gray-600 text-xs font-medium mb-1">gameSettings</div>
                    <pre className="text-xs text-gray-800 bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto max-h-40">
                      {JSON.stringify(detailGeneral.gameSettings ?? null, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 shrink-0 flex justify-end bg-white">
              <button
                type="button"
                onClick={closeDetail}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
