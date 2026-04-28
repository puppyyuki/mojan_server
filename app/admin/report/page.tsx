'use client'

import { useCallback, useState } from 'react'
import { BarChart3, RefreshCw, ExternalLink, FileSpreadsheet } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import Link from 'next/link'

interface PlayerReportRow {
  timeRange: string
  clubSixId: string
  clubName: string
  playerDisplay: string
  playerId: string
  playerUserId: string
  playerNickname: string
  battleScore: number
  bigWinnerCount: number
  selfDrawCount: number
  roomCardConsumed: number
  completedGames: number
  dongMoney: number
  waterMoney: number
}

interface SummaryData {
  rows: PlayerReportRow[]
  totals: {
    playerCount: number
    totalBattleScore: number
    totalSelfDrawCount: number
    totalRoomCardConsumed: number
    totalCompletedGames: number
    totalDongMoney: number
    totalWaterMoney: number
  }
  filter: { startDate: string; endDate: string; clubId: string }
  club: { clubInternalId: string | null; clubSixId: string; clubName: string }
}

interface QueryDraft {
  startDate: string
  endDate: string
  clubId: string
}

export default function ReportPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SummaryData | null>(null)
  const [draft, setDraft] = useState<QueryDraft>({ startDate: '', endDate: '', clubId: '' })
  const [applied, setApplied] = useState<QueryDraft | null>(null)
  const [queried, setQueried] = useState(false)

  const fetchReport = useCallback(async (query: QueryDraft) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      q.set('startDate', query.startDate)
      q.set('endDate', query.endDate)
      q.set('clubId', query.clubId.trim())
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
  }, [])

  const handleQuery = () => {
    const next = {
      startDate: draft.startDate.trim(),
      endDate: draft.endDate.trim(),
      clubId: draft.clubId.trim(),
    }
    if (!next.startDate || !next.endDate || !next.clubId) {
      alert('請先完整選擇時間區間與輸入俱樂部 ID')
      return
    }
    if (next.startDate > next.endDate) {
      alert('開始日期不可晚於結束日期')
      return
    }
    setApplied(next)
    setQueried(true)
    void fetchReport(next)
  }

  const handleExportCsv = () => {
    if (!data?.rows.length) {
      alert('沒有可匯出的資料')
      return
    }
    const headers = [
      '時間區間',
      '俱樂部 ID',
      '俱樂部名稱',
      '玩家暱稱 + ID',
      '戰績',
      '大贏家',
      '自摸次數',
      '房卡消耗',
      '場次',
      '咚錢',
      '水錢',
    ]
    const lines = [
      headers.join(','),
      ...data.rows.map((r) =>
        [
          `"${r.timeRange}"`,
          r.clubSixId,
          `"${(r.clubName || '').replace(/"/g, '""')}"`,
          `"${(r.playerDisplay || '').replace(/"/g, '""')}"`,
          r.battleScore,
          r.bigWinnerCount,
          r.selfDrawCount,
          r.roomCardConsumed,
          r.completedGames,
          r.dongMoney,
          r.waterMoney,
        ].join(',')
      ),
    ]
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `club-player-report-${data.filter.startDate}-${data.filter.endDate}-${data.filter.clubId}.csv`
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
               依<strong className="text-gray-800">時間區間 + 俱樂部 ID</strong>，統計該俱樂部每位玩家在區間內的戰績、自摸次數、房卡消耗、場次、咚錢（各已結算場自摸×該房台數）與水錢（各場若有贏分則 5%）（房卡與 App 俱樂部排行榜一致）。逐局紀錄請至
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">俱樂部 ID</label>
            <input
              value={draft.clubId}
              onChange={(e) => setDraft((d) => ({ ...d, clubId: e.target.value.replace(/\s+/g, '') }))}
              placeholder="輸入 6 碼 ID"
              className={`px-3 py-1.5 text-sm w-44 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
            />
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
            onClick={() => {
              if (!applied) return
              void fetchReport(applied)
            }}
            disabled={loading || !applied}
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
            {data.filter.startDate} ~ {data.filter.endDate}
            {` · 俱樂部 ID「${data.filter.clubId}」`}
          </p>
        )}
      </div>

      {data && queried && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">玩家數</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.playerCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">自摸次數加總</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.totalSelfDrawCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">房卡消耗加總</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.totalRoomCardConsumed}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">完整場次加總</div>
            <div className="text-2xl font-semibold text-emerald-800 mt-1">{data.totals.totalCompletedGames}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">咚錢加總</div>
            <div className="text-2xl font-semibold text-gray-900 mt-1">{data.totals.totalDongMoney}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
            <div className="text-xs text-gray-500 uppercase">水錢加總</div>
            <div className="text-2xl font-semibold text-amber-900 mt-1">{data.totals.totalWaterMoney}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1550px] table-fixed divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-1/8 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">時間區間</th>
                <th className="w-1/8 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">俱樂部 ID</th>
                <th className="w-1/8 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">俱樂部名稱</th>
                <th className="w-1/8 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">玩家暱稱 + ID</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">戰績</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">大贏家</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">自摸次數</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">房卡消耗</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">場次</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r border-gray-200">咚錢</th>
                <th className="w-1/8 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">水錢</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {!queried ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    請先設定時間區間與俱樂部 ID，再按「查詢」
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                    載入中…
                  </td>
                </tr>
              ) : !data?.rows.length ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                    此條件下無符合資料
                  </td>
                </tr>
              ) : (
                data.rows.map((r, i) => (
                  <tr key={`${r.playerId}-${r.timeRange}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                    <td className="px-4 py-2 text-gray-700 border-r border-gray-200">{r.timeRange}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-900 border-r border-gray-200">{r.clubSixId}</td>
                    <td className="px-4 py-2 text-gray-900 border-r border-gray-200">{r.clubName}</td>
                    <td className="px-4 py-2 text-gray-700 border-r border-gray-200">{r.playerDisplay}</td>
                    <td className="px-4 py-2 text-center font-medium text-gray-900 border-r border-gray-200">{r.battleScore}</td>
                    <td className="px-4 py-2 text-center text-gray-700 border-r border-gray-200">{r.bigWinnerCount}</td>
                    <td className="px-4 py-2 text-center text-gray-700 border-r border-gray-200">{r.selfDrawCount}</td>
                    <td className="px-4 py-2 text-center text-emerald-800 font-medium border-r border-gray-200">{r.roomCardConsumed}</td>
                    <td className="px-4 py-2 text-center text-gray-700">{r.completedGames}</td>
                    <td className="px-4 py-2 text-center text-gray-900 font-medium border-r border-gray-200">{r.dongMoney}</td>
                    <td className="px-4 py-2 text-center text-amber-900 font-medium">{r.waterMoney}</td>
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
