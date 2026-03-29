'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3, RefreshCw, Search, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import Link from 'next/link'

interface ClubRow {
  clubInternalId: string
  clubSixId: string
  clubName: string
  clubCardBalance: number | null
  gameCount: number
  totalRounds: number
  totalRoomCardsConsumed: number
  avgRoomCardsPerGame: number
}

interface SummaryData {
  rows: ClubRow[]
  totals: { gameCount: number; totalRounds: number; totalRoomCardsConsumed: number }
  filter: { startDate: string | null; endDate: string | null; keyword: string | null }
}

export default function ReportPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SummaryData | null>(null)
  const [draft, setDraft] = useState({ startDate: '', endDate: '', keyword: '' })
  const [applied, setApplied] = useState(draft)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (applied.startDate) q.set('startDate', applied.startDate)
      if (applied.endDate) q.set('endDate', applied.endDate)
      if (applied.keyword.trim()) q.set('keyword', applied.keyword.trim())
      const res = await apiGet(`/api/admin/reports/club-summary?${q.toString()}`)
      const json = await res.json()
      if (json.success && json.data) {
        setData(json.data)
      } else {
        alert(json.error || '載入失敗')
      }
    } catch (e) {
      console.error(e)
      alert('載入報表失敗')
    } finally {
      setLoading(false)
    }
  }, [applied])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleQuery = () => {
    setApplied({ ...draft })
  }

  const handleExportCsv = () => {
    if (!data?.rows.length) {
      alert('沒有可匯出的資料')
      return
    }
    const headers = [
      '俱樂部6碼',
      '俱樂部名稱',
      '目前俱樂部房卡餘額',
      '對局數',
      '總局數',
      '總消耗房卡',
      '平均每局耗卡',
    ]
    const lines = [
      headers.join(','),
      ...data.rows.map((r) =>
        [
          r.clubSixId,
          `"${(r.clubName || '').replace(/"/g, '""')}"`,
          r.clubCardBalance ?? '',
          r.gameCount,
          r.totalRounds,
          r.totalRoomCardsConsumed,
          r.avgRoomCardsPerGame,
        ].join(',')
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `club-report-${applied.startDate || 'all'}-${applied.endDate || 'all'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const inputBase =
    'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded shadow-sm'

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-gray-900">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-3 mb-2">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">俱樂部報表</h2>
            <p className="text-sm text-gray-600 mt-1">
              依<strong className="text-gray-800">結算時間</strong>統計各俱樂部在區間內的對局數、總局數與房卡消耗彙總。計分細節、逐局紀錄請至
              <Link
                href="/admin/game-record-management"
                className="text-blue-600 hover:underline inline-flex items-center gap-0.5 mx-1"
              >
                遊戲紀錄管理
                <ExternalLink className="w-3 h-3" />
              </Link>
              查閱「俱樂部對戰」分頁。
            </p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">開始日期（結算日）</label>
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">俱樂部關鍵字</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={draft.keyword}
                onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                placeholder="6 碼或名稱片段"
                className={`pl-8 pr-3 py-1.5 text-sm w-52 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuery}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800 disabled:opacity-50"
          >
            查詢
          </button>
          <button
            type="button"
            onClick={() => fetchReport()}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            title="以目前條件重新載入"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新整理
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data?.rows.length}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 bg-white text-sm text-gray-800 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-gray-700" />
            匯出 CSV
          </button>
        </div>
        {data?.filter && (
          <p className="text-xs text-gray-500 mt-2">
            目前條件：
            {data.filter.startDate || '（不限起）'} ~ {data.filter.endDate || '（不限迄）'}
            {data.filter.keyword ? ` · 關鍵字「${data.filter.keyword}」` : ''}
          </p>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">對局數（筆）</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.gameCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">總局數加總</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.totalRounds}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">總消耗房卡</div>
            <div className="text-2xl font-semibold text-emerald-800 mt-1">{data.totals.totalRoomCardsConsumed}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">俱樂部 6 碼</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">名稱</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">俱樂部房卡餘額</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">區間對局數</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">區間總局數</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">區間耗卡</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">平均每局耗卡</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && !data ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                    載入中…
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                    載入中…
                  </td>
                </tr>
              ) : !data?.rows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    無資料，請調整日期或關鍵字後查詢
                  </td>
                </tr>
              ) : (
                data.rows.map((r, i) => (
                  <tr key={r.clubInternalId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-900">{r.clubSixId}</td>
                    <td className="px-4 py-2 text-gray-900">{r.clubName}</td>
                    <td className="px-4 py-2 text-center text-gray-700">{r.clubCardBalance ?? '—'}</td>
                    <td className="px-4 py-2 text-center font-medium text-gray-900">{r.gameCount}</td>
                    <td className="px-4 py-2 text-center text-gray-700">{r.totalRounds}</td>
                    <td className="px-4 py-2 text-center text-emerald-800 font-medium">{r.totalRoomCardsConsumed}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{r.avgRoomCardsPerGame}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
