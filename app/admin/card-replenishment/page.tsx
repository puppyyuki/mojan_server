'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, CreditCard, Search, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'

interface ReplenishRow {
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

function formatDt(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function CardReplenishmentPage() {
  const [submitting, setSubmitting] = useState(false)
  const [playerLookup, setPlayerLookup] = useState('')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ReplenishRow[]>([])
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

  const buildQuery = useCallback(() => {
    const q = new URLSearchParams()
    q.set('page', String(page))
    q.set('pageSize', String(pageSize))
    if (applied.keyword.trim()) q.set('keyword', applied.keyword.trim())
    if (applied.startDate) q.set('startDate', applied.startDate)
    if (applied.endDate) q.set('endDate', applied.endDate)
    if (applied.manualOnly) q.set('manualOnly', '1')
    return q.toString()
  }, [page, applied])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet(`/api/admin/card-replenishment?${buildQuery()}`)
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
  }, [buildQuery])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const handleSubmit = async (e: React.FormEvent) => {
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
        fetchRecords()
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const inputBase =
    'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded shadow-sm'

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-gray-900">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">手動補卡</h2>
            <p className="text-sm text-gray-600 mt-1">
              輸入玩家<strong className="text-gray-800">內部 ID</strong>（資料庫 id）或<strong className="text-gray-800">6 碼使用者 ID</strong>（邀請碼同號），補發房卡並寫入備註。系統推廣獎勵等自動入帳的紀錄通常沒有備註，可用下方篩選區分。
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
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
            若玩家在「玩家管理」以編輯方式調整房卡且為<strong className="text-gray-700">增加</strong>，也會產生補卡紀錄（無備註）。本頁提交之紀錄一律帶備註，便於稽核。
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
            onClick={() => {
              fetchRecords()
            }}
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
    </div>
  )
}
