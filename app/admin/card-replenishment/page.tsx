'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  RefreshCw,
  CreditCard,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  Building2,
  User,
} from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'

type MainTab = 'player' | 'club'

interface PlayerReplenishRow {
  id: string
  createdAt: string
  playerId: string
  userId: string
  nickname: string
  amount: number
  previousCount: number
  newCount: number
  note: string
  adminUsername: string
}

interface ClubReplenishRow {
  id: string
  createdAt: string
  clubInternalId: string
  clubSixId: string
  clubName: string
  amount: number
  previousCount: number
  newCount: number
  note: string
  adminUsername: string
}

function formatDt(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const inputBase =
  'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded shadow-sm'

export default function CardReplenishmentPage() {
  const [mainTab, setMainTab] = useState<MainTab>('player')

  const [submitting, setSubmitting] = useState(false)
  const [playerLookup, setPlayerLookup] = useState('')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PlayerReplenishRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [draft, setDraft] = useState({
    keyword: '',
    startDate: '',
    endDate: '',
    manualOnly: false,
  })
  const [applied, setApplied] = useState(draft)

  const [clubSubmitting, setClubSubmitting] = useState(false)
  const [clubLookup, setClubLookup] = useState('')
  const [clubAmount, setClubAmount] = useState<string>('')
  const [clubNote, setClubNote] = useState('')

  const [clubLoading, setClubLoading] = useState(false)
  const [clubItems, setClubItems] = useState<ClubReplenishRow[]>([])
  const [clubTotal, setClubTotal] = useState(0)
  const [clubPage, setClubPage] = useState(1)

  const [clubDraft, setClubDraft] = useState({
    keyword: '',
    startDate: '',
    endDate: '',
    manualOnly: false,
  })
  const [clubApplied, setClubApplied] = useState(clubDraft)

  const buildPlayerQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    if (applied.keyword.trim()) q.set('keyword', applied.keyword.trim())
    if (applied.startDate) q.set('startDate', applied.startDate)
    if (applied.endDate) q.set('endDate', applied.endDate)
    if (applied.manualOnly) q.set('manualOnly', '1')
    return q.toString()
  }, [page, applied])

  const buildClubQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('page', String(clubPage))
    q.set('pageSize', String(pageSize))
    if (clubApplied.keyword.trim()) q.set('keyword', clubApplied.keyword.trim())
    if (clubApplied.startDate) q.set('startDate', clubApplied.startDate)
    if (clubApplied.endDate) q.set('endDate', clubApplied.endDate)
    if (clubApplied.manualOnly) q.set('manualOnly', '1')
    return q.toString()
  }, [clubPage, clubApplied])

  const fetchPlayerRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet(`/api/admin/card-replenishment?${buildPlayerQuery()}`)
      const json = await res.json()
      if (json.success && json.data) {
        setItems(json.data.items || [])
        setTotal(json.data.total ?? 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [buildPlayerQuery])

  const fetchClubRecords = useCallback(async () => {
    setClubLoading(true)
    try {
      const res = await apiGet(`/api/admin/card-replenishment/club?${buildClubQuery()}`)
      const json = await res.json()
      if (json.success && json.data) {
        setClubItems(json.data.items || [])
        setClubTotal(json.data.total ?? 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setClubLoading(false)
    }
  }, [buildClubQuery])

  useEffect(() => {
    if (mainTab === 'player') {
      fetchPlayerRecords()
    }
  }, [mainTab, fetchPlayerRecords])

  useEffect(() => {
    if (mainTab === 'club') {
      fetchClubRecords()
    }
  }, [mainTab, fetchClubRecords])

  const handlePlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(amount, 10)
    if (!playerLookup.trim()) {
      alert('請輸入玩家 ID')
      return
    }
    if (!Number.isFinite(n) || n <= 0) {
      alert('請輸入有效的補卡數量（正整數）')
      return
    }
    if (!note.trim()) {
      alert('請填寫補卡備註／原因')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPost('/api/admin/card-replenishment', {
        playerLookup: playerLookup.trim(),
        amount: n,
        note: note.trim(),
      })
      const json = await res.json()
      if (json.success) {
        alert(
          `補卡成功：${json.data?.nickname ?? ''}（${json.data?.userId ?? ''}）+${json.data?.amount} 張，餘額 ${json.data?.newCount}`
        )
        setAmount('')
        setNote('')
        setPage(1)
        fetchPlayerRecords()
      } else {
        alert(json.error || '補卡失敗')
      }
    } catch (err) {
      console.error(err)
      alert('補卡失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClubSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(clubAmount, 10)
    if (!clubLookup.trim()) {
      alert('請輸入俱樂部識別')
      return
    }
    if (!Number.isFinite(n) || n <= 0) {
      alert('請輸入有效的補卡數量（正整數）')
      return
    }
    if (!clubNote.trim()) {
      alert('請填寫補卡備註／原因')
      return
    }
    setClubSubmitting(true)
    try {
      const res = await apiPost('/api/admin/card-replenishment/club', {
        clubLookup: clubLookup.trim(),
        amount: n,
        note: clubNote.trim(),
      })
      const json = await res.json()
      if (json.success) {
        alert(
          `俱樂部補卡成功：${json.data?.clubName ?? ''}（${json.data?.clubSixId ?? ''}）+${json.data?.amount} 張，俱樂部房卡餘額 ${json.data?.newCount}`
        )
        setClubAmount('')
        setClubNote('')
        setClubPage(1)
        fetchClubRecords()
      } else {
        alert(json.error || '俱樂部補卡失敗')
      }
    } catch (err) {
      console.error(err)
      alert('俱樂部補卡失敗')
    } finally {
      setClubSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const clubTotalPages = Math.max(1, Math.ceil(clubTotal / pageSize))

  const tabBtn = (tab: MainTab, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setMainTab(tab)}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
        mainTab === tab
          ? 'border-blue-600 text-blue-700 bg-white'
          : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100/80'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-gray-900">
      <div className="flex flex-wrap gap-0 border-b border-gray-200 mb-4 bg-gray-100/60 rounded-t-lg px-1 pt-1">
        {tabBtn(
          'player',
          '補給玩家（個人房卡）',
          <User className="w-4 h-4 shrink-0" />
        )}
        {tabBtn(
          'club',
          '補給俱樂部（俱樂部房卡）',
          <Building2 className="w-4 h-4 shrink-0" />
        )}
      </div>

      {mainTab === 'player' && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 rounded-tl-none">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">手動補卡 — 玩家</h2>
                <p className="text-sm text-gray-600 mt-1">
                  輸入玩家<strong className="text-gray-800">內部 ID</strong>或<strong className="text-gray-800">6 碼使用者 ID</strong>
                  ，增加<strong className="text-gray-800">個人房卡</strong>。系統推廣獎勵等自動入帳的紀錄通常沒有備註，可用下方篩選區分。
                </p>
              </div>
            </div>

            <form onSubmit={handlePlayerSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">玩家識別</label>
                <input
                  value={playerLookup}
                  onChange={(e) => setPlayerLookup(e.target.value)}
                  placeholder="內部 ID 或 6 碼 userId"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">補卡數量</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="正整數"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">備註／原因（必填）</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例：活動補償、客訴處理、測試帳號調整…"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-4 flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? '處理中…' : '確認補卡'}
                </button>
              </div>
            </form>

            <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 bg-slate-50 border border-slate-100 rounded p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                若於「玩家管理」編輯房卡且為<strong className="text-gray-700">增加</strong>，也會產生補卡紀錄（可能無備註）。本頁提交之紀錄一律帶備註。
              </span>
            </div>
          </div>

          <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">關鍵字（暱稱／使用者 ID／內部 ID）</label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={draft.keyword}
                    onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                    className={`pl-8 pr-3 py-1.5 text-sm w-56 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                    placeholder="搜尋玩家…"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">開始日期</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                  className={`px-3 py-1.5 text-sm [color-scheme:light] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className={`px-3 py-1.5 text-sm [color-scheme:light] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.manualOnly}
                  onChange={(e) => setDraft((d) => ({ ...d, manualOnly: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                僅顯示有備註（本頁手動補卡）
              </label>
              <button
                type="button"
                onClick={() => {
                  setApplied(draft)
                  setPage(1)
                }}
                className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800"
              >
                套用篩選
              </button>
              <button
                type="button"
                onClick={() => fetchPlayerRecords()}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                重新整理
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">共 {total} 筆紀錄</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">時間</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">使用者 ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">暱稱</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補卡量</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補前</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補後</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作者</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading && items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                        載入中…
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        尚無符合條件之紀錄
                      </td>
                    </tr>
                  ) : (
                    items.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                        <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{formatDt(row.createdAt)}</td>
                        <td className="px-4 py-2 text-gray-900 font-mono text-xs">{row.userId}</td>
                        <td className="px-4 py-2 text-gray-900">{row.nickname}</td>
                        <td className="px-4 py-2 text-center font-medium text-emerald-700">+{row.amount}</td>
                        <td className="px-4 py-2 text-center text-gray-600">{row.previousCount}</td>
                        <td className="px-4 py-2 text-center text-gray-900">{row.newCount}</td>
                        <td className="px-4 py-2 text-gray-700">{row.adminUsername}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-md">
                          <span className="line-clamp-2" title={row.note || '—'}>
                            {row.note || '—'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-600">
                  第 {page} / {totalPages} 頁
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {mainTab === 'club' && (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 rounded-tl-none">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">手動補卡 — 俱樂部</h2>
                <p className="text-sm text-gray-600 mt-1">
                  輸入俱樂部<strong className="text-gray-800">內部 ID</strong>或<strong className="text-gray-800">6 碼俱樂部編號</strong>
                  ，直接增加該俱樂部的<strong className="text-gray-800">俱樂部房卡餘額</strong>（
                  <code className="text-xs bg-gray-100 text-gray-800 px-1 rounded">clubs.cardCount</code>
                  ）。此與成員從個人轉入俱樂部的「頂部條補卡」不同，不會扣減任何玩家個人房卡。
                </p>
              </div>
            </div>

            <form onSubmit={handleClubSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">俱樂部識別</label>
                <input
                  value={clubLookup}
                  onChange={(e) => setClubLookup(e.target.value)}
                  placeholder="內部 ID 或 6 碼俱樂部編號"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">補卡數量</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={clubAmount}
                  onChange={(e) => setClubAmount(e.target.value)}
                  placeholder="正整數"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">備註／原因（必填）</label>
                <input
                  value={clubNote}
                  onChange={(e) => setClubNote(e.target.value)}
                  placeholder="例：賽事贊助、開站禮、誤扣補回…"
                  className={`w-full px-3 py-2 text-sm focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-4 flex gap-2">
                <button
                  type="submit"
                  disabled={clubSubmitting}
                  className="px-4 py-2 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  {clubSubmitting ? '處理中…' : '確認補給俱樂部'}
                </button>
              </div>
            </form>

            <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 bg-teal-50/40 border border-teal-100 rounded p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-teal-700" />
              <span>此處紀錄僅限後台直接加給俱樂部的房卡；成員從個人轉入俱樂部的補卡請至「俱樂部管理」相關紀錄查看。</span>
            </div>
          </div>

          <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">關鍵字（6 碼／名稱／內部 ID）</label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={clubDraft.keyword}
                    onChange={(e) => setClubDraft((d) => ({ ...d, keyword: e.target.value }))}
                    className={`pl-8 pr-3 py-1.5 text-sm w-56 focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                    placeholder="搜尋俱樂部…"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">開始日期</label>
                <input
                  type="date"
                  value={clubDraft.startDate}
                  onChange={(e) => setClubDraft((d) => ({ ...d, startDate: e.target.value }))}
                  className={`px-3 py-1.5 text-sm [color-scheme:light] focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">結束日期</label>
                <input
                  type="date"
                  value={clubDraft.endDate}
                  onChange={(e) => setClubDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className={`px-3 py-1.5 text-sm [color-scheme:light] focus:ring-1 focus:ring-teal-600 focus:border-teal-600 ${inputBase}`}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clubDraft.manualOnly}
                  onChange={(e) => setClubDraft((d) => ({ ...d, manualOnly: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                僅顯示有備註
              </label>
              <button
                type="button"
                onClick={() => {
                  setClubApplied(clubDraft)
                  setClubPage(1)
                }}
                className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800"
              >
                套用篩選
              </button>
              <button
                type="button"
                onClick={() => fetchClubRecords()}
                disabled={clubLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${clubLoading ? 'animate-spin' : ''}`} />
                重新整理
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">共 {clubTotal} 筆紀錄</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">時間</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">俱樂部 6 碼</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">俱樂部名稱</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補卡量</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補前</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">補後</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">操作者</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase min-w-[200px]">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clubLoading && clubItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                        載入中…
                      </td>
                    </tr>
                  ) : clubItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        尚無符合條件之紀錄
                      </td>
                    </tr>
                  ) : (
                    clubItems.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                        <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{formatDt(row.createdAt)}</td>
                        <td className="px-4 py-2 text-gray-900 font-mono text-xs">{row.clubSixId}</td>
                        <td className="px-4 py-2 text-gray-900">{row.clubName}</td>
                        <td className="px-4 py-2 text-center font-medium text-teal-700">+{row.amount}</td>
                        <td className="px-4 py-2 text-center text-gray-600">{row.previousCount}</td>
                        <td className="px-4 py-2 text-center text-gray-900">{row.newCount}</td>
                        <td className="px-4 py-2 text-gray-700">{row.adminUsername}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-md">
                          <span className="line-clamp-2" title={row.note || '—'}>
                            {row.note || '—'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {clubTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-600">
                  第 {clubPage} / {clubTotalPages} 頁
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={clubPage <= 1}
                    onClick={() => setClubPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={clubPage >= clubTotalPages}
                    onClick={() => setClubPage((p) => Math.min(clubTotalPages, p + 1))}
                    className="p-1.5 rounded border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
