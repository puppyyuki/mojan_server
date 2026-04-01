'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface TrendPoint {
  label: string
  value: number
}

interface ClubRankRow {
  rank: number
  clubId: string
  clubSixId: string
  clubName: string
  gameCount: number
  totalRounds: number
  totalRoomCardsConsumed: number
}

interface PlayerRankRow {
  rank: number
  playerId: string
  userId: string
  nickname: string
  cardCount: number
  totalScore: number
  bigWinnerCount: number
  gameCount: number
}

interface StatisticsData {
  salesCards: { daily: number; weekly: number; monthly: number }
  roomOpenStats: { hourly: TrendPoint[]; weekly: TrendPoint[] }
  newPlayers: { weekly: TrendPoint[]; monthly: TrendPoint[] }
  playerActivity: { weekly: TrendPoint[]; monthly: TrendPoint[] }
  clubRanking: ClubRankRow[]
  playerRanking: PlayerRankRow[]
  playerRankingMeta?: {
    scope: 'all' | 'club' | 'lobby'
    period: 'week' | 'month' | '3months'
  }
}

function tailRows(rows: TrendPoint[], count: number): TrendPoint[] {
  if (rows.length <= count) return rows
  return rows.slice(rows.length - count)
}

function TrendTable({
  title,
  rows,
  rightControl,
  chartMode,
  lineType,
  showTable,
  showAverage,
}: {
  title: string
  rows: TrendPoint[]
  rightControl?: React.ReactNode
  chartMode: 'line' | 'area'
  lineType: 'monotone' | 'linear' | 'step'
  showTable: boolean
  showAverage: boolean
}) {
  const max = rows.length ? Math.max(...rows.map((x) => x.value)) : 0
  const min = rows.length ? Math.min(...rows.map((x) => x.value)) : 0
  const average = rows.length
    ? Number((rows.reduce((sum, row) => sum + row.value, 0) / rows.length).toFixed(2))
    : 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800 flex items-center justify-between gap-3">
        <span>{title}</span>
        {rightControl || <span />}
      </div>
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>峰值：{max}</span>
          <span>低點：{min}</span>
        </div>
        <div className="h-52 w-full">
          {rows.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'area' ? (
                <AreaChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 6 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    cursor={{ stroke: '#93c5fd', strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                    }}
                    formatter={(value: number) => [`${value}`, '數值']}
                    labelFormatter={(label) => `區間：${label}`}
                  />
                  {showAverage && (
                    <ReferenceLine
                      y={average}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: `平均 ${average}`, position: 'insideTopRight', fill: '#b45309', fontSize: 10 }}
                    />
                  )}
                  <Area
                    type={lineType}
                    dataKey="value"
                    stroke="#2563eb"
                    fill="#93c5fd"
                    fillOpacity={0.4}
                    strokeWidth={2.5}
                    dot={{ r: 2.8, stroke: '#1d4ed8', strokeWidth: 1, fill: '#ffffff' }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              ) : (
                <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 6 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip
                    cursor={{ stroke: '#93c5fd', strokeWidth: 1 }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
                    }}
                    formatter={(value: number) => [`${value}`, '數值']}
                    labelFormatter={(label) => `區間：${label}`}
                  />
                  {showAverage && (
                    <ReferenceLine
                      y={average}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      label={{ value: `平均 ${average}`, position: 'insideTopRight', fill: '#b45309', fontSize: 10 }}
                    />
                  )}
                  <Line
                    type={lineType}
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3, stroke: '#1d4ed8', strokeWidth: 1, fill: '#ffffff' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-gray-500">暫無趨勢資料</div>
          )}
        </div>
      </div>
      {showTable && (
        <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">區間</th>
              <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">數值</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="px-4 py-2 text-gray-700">{row.label}</td>
                <td className="px-4 py-2 text-right text-gray-900 font-medium">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export default function StatisticsPage() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<StatisticsData | null>(null)
  const [roomHourlyCount, setRoomHourlyCount] = useState(24)
  const [roomWeeklyCount, setRoomWeeklyCount] = useState(8)
  const [newWeeklyCount, setNewWeeklyCount] = useState(8)
  const [newMonthlyCount, setNewMonthlyCount] = useState(6)
  const [activeWeeklyCount, setActiveWeeklyCount] = useState(8)
  const [activeMonthlyCount, setActiveMonthlyCount] = useState(6)
  const [clubRankCount, setClubRankCount] = useState(20)
  const [playerRankCount, setPlayerRankCount] = useState(20)
  const [salesView, setSalesView] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [chartMode, setChartMode] = useState<'line' | 'area'>('line')
  const [lineType, setLineType] = useState<'monotone' | 'linear' | 'step'>('monotone')
  const [showTable, setShowTable] = useState(true)
  const [showAverage, setShowAverage] = useState(true)
  const [clubSortBy, setClubSortBy] = useState<'gameCount' | 'totalRounds' | 'totalRoomCardsConsumed'>('gameCount')
  const [playerSortBy, setPlayerSortBy] = useState<'totalScore' | 'bigWinnerCount' | 'gameCount' | 'cardCount'>('totalScore')
  const [playerScope, setPlayerScope] = useState<'all' | 'club' | 'lobby'>('all')
  const [playerPeriod, setPlayerPeriod] = useState<'week' | 'month' | '3months'>('month')

  const fetchOverview = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({
        playerScope,
        playerPeriod,
      })
      const res = await apiGet(`/api/admin/statistics/overview?${q.toString()}`)
      const json = await res.json()
      if (json.success && json.data) {
        setData(json.data)
      } else {
        alert(json.error || '取得統計資料失敗')
      }
    } catch (error) {
      console.error(error)
      alert('取得統計資料失敗')
    } finally {
      setLoading(false)
    }
  }, [playerScope, playerPeriod])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  const sortedClubRanking = [...(data?.clubRanking || [])]
    .sort((a, b) => (b[clubSortBy] as number) - (a[clubSortBy] as number))
    .slice(0, clubRankCount)
    .map((row, idx) => ({ ...row, rank: idx + 1 }))

  const sortedPlayerRanking = [...(data?.playerRanking || [])]
    .sort((a, b) => (b[playerSortBy] as number) - (a[playerSortBy] as number))
    .slice(0, playerRankCount)
    .map((row, idx) => ({ ...row, rank: idx + 1 }))

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-gray-900 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">統計圖表</h2>
          <p className="text-sm text-gray-600">公司銷售房卡、開桌數、玩家成長與活躍、俱樂部與玩家排行榜</p>
        </div>
        <button
          type="button"
          onClick={fetchOverview}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          重新整理
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm md:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500 uppercase">公司銷售房卡</div>
            <select
              value={salesView}
              onChange={(e) => setSalesView(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="daily">每日</option>
              <option value="weekly">每週</option>
              <option value="monthly">每月</option>
            </select>
          </div>
          <div className="text-2xl font-semibold mt-2">
            {salesView === 'daily'
              ? data?.salesCards.daily ?? 0
              : salesView === 'weekly'
                ? data?.salesCards.weekly ?? 0
                : data?.salesCards.monthly ?? 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">可切換時間篩選查看銷售房卡統計</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="text-xs text-gray-500 uppercase mb-3">圖表客製化設定</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs text-gray-700 space-y-1">
            <span className="block">圖形模式</span>
            <select
              value={chartMode}
              onChange={(e) => setChartMode(e.target.value as 'line' | 'area')}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="line">折線圖</option>
              <option value="area">面積圖</option>
            </select>
          </label>
          <label className="text-xs text-gray-700 space-y-1">
            <span className="block">線條風格</span>
            <select
              value={lineType}
              onChange={(e) => setLineType(e.target.value as 'monotone' | 'linear' | 'step')}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="monotone">平滑</option>
              <option value="linear">直線</option>
              <option value="step">階梯</option>
            </select>
          </label>
          <label className="text-xs text-gray-700 space-y-1">
            <span className="block">平均線</span>
            <select
              value={showAverage ? 'on' : 'off'}
              onChange={(e) => setShowAverage(e.target.value === 'on')}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="on">顯示</option>
              <option value="off">隱藏</option>
            </select>
          </label>
          <label className="text-xs text-gray-700 space-y-1">
            <span className="block">下方數據表</span>
            <select
              value={showTable ? 'on' : 'off'}
              onChange={(e) => setShowTable(e.target.value === 'on')}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="on">顯示</option>
              <option value="off">隱藏</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendTable
          title="開桌數（每小時）"
          rows={tailRows(data?.roomOpenStats.hourly || [], roomHourlyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={roomHourlyCount}
              onChange={(e) => setRoomHourlyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={6}>最近 6 小時</option>
              <option value={12}>最近 12 小時</option>
              <option value={24}>最近 24 小時</option>
            </select>
          }
        />
        <TrendTable
          title="開桌數（每週）"
          rows={tailRows(data?.roomOpenStats.weekly || [], roomWeeklyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={roomWeeklyCount}
              onChange={(e) => setRoomWeeklyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={4}>最近 4 週</option>
              <option value={8}>最近 8 週</option>
            </select>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendTable
          title="玩家新增（每週）"
          rows={tailRows(data?.newPlayers.weekly || [], newWeeklyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={newWeeklyCount}
              onChange={(e) => setNewWeeklyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={4}>最近 4 週</option>
              <option value={8}>最近 8 週</option>
            </select>
          }
        />
        <TrendTable
          title="玩家新增（每月）"
          rows={tailRows(data?.newPlayers.monthly || [], newMonthlyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={newMonthlyCount}
              onChange={(e) => setNewMonthlyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={3}>最近 3 個月</option>
              <option value={6}>最近 6 個月</option>
            </select>
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendTable
          title="玩家活躍（每週，依最後登入）"
          rows={tailRows(data?.playerActivity.weekly || [], activeWeeklyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={activeWeeklyCount}
              onChange={(e) => setActiveWeeklyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={4}>最近 4 週</option>
              <option value={8}>最近 8 週</option>
            </select>
          }
        />
        <TrendTable
          title="玩家活躍（每月，依最後登入）"
          rows={tailRows(data?.playerActivity.monthly || [], activeMonthlyCount)}
          chartMode={chartMode}
          lineType={lineType}
          showTable={showTable}
          showAverage={showAverage}
          rightControl={
            <select
              value={activeMonthlyCount}
              onChange={(e) => setActiveMonthlyCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={3}>最近 3 個月</option>
              <option value={6}>最近 6 個月</option>
            </select>
          }
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800 flex items-center justify-between gap-3">
          <span>俱樂部排行榜</span>
          <div className="flex items-center gap-2">
            <select
              value={clubSortBy}
              onChange={(e) => setClubSortBy(e.target.value as 'gameCount' | 'totalRounds' | 'totalRoomCardsConsumed')}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="gameCount">依場次</option>
              <option value="totalRounds">依圈數</option>
              <option value="totalRoomCardsConsumed">依耗卡</option>
            </select>
            <select
              value={clubRankCount}
              onChange={(e) => setClubRankCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={10}>前 10 名</option>
              <option value={20}>前 20 名</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">排名</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">俱樂部</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">場次</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">圈數</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">耗卡</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedClubRanking.map((row) => (
                <tr key={row.clubId}>
                  <td className="px-4 py-2 text-center">{row.rank}</td>
                  <td className="px-4 py-2 text-gray-900">{row.clubName} ({row.clubSixId})</td>
                  <td className="px-4 py-2 text-center">{row.gameCount}</td>
                  <td className="px-4 py-2 text-center">{row.totalRounds}</td>
                  <td className="px-4 py-2 text-center">{row.totalRoomCardsConsumed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800 flex items-center justify-between gap-3">
          <span>玩家排行榜</span>
          <div className="flex items-center gap-2">
            <select
              value={playerScope}
              onChange={(e) => setPlayerScope(e.target.value as 'all' | 'club' | 'lobby')}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="all">全服（俱樂部＋大廳）</option>
              <option value="club">僅俱樂部</option>
              <option value="lobby">僅大廳</option>
            </select>
            <select
              value={playerPeriod}
              onChange={(e) => setPlayerPeriod(e.target.value as 'week' | 'month' | '3months')}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="week">本週</option>
              <option value="month">本月</option>
              <option value="3months">近三個月</option>
            </select>
            <select
              value={playerSortBy}
              onChange={(e) => setPlayerSortBy(e.target.value as 'totalScore' | 'bigWinnerCount' | 'gameCount' | 'cardCount')}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value="totalScore">依總分</option>
              <option value="bigWinnerCount">依大贏家次數</option>
              <option value="gameCount">依場次</option>
              <option value="cardCount">依房卡餘額</option>
            </select>
            <select
              value={playerRankCount}
              onChange={(e) => setPlayerRankCount(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 bg-white"
            >
              <option value={10}>前 10 名</option>
              <option value={20}>前 20 名</option>
            </select>
          </div>
        </div>
        <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
          來源：{
            playerScope === 'all'
              ? '全服（俱樂部＋大廳）'
              : playerScope === 'club'
                ? '僅俱樂部'
                : '僅大廳'
          }，區間：{
            playerPeriod === 'week'
              ? '本週'
              : playerPeriod === 'month'
                ? '本月'
                : '近三個月'
          }
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">排名</th>
                <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">玩家</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">總分</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">大贏家次數</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">場次</th>
                <th className="px-4 py-2 text-center text-xs text-gray-500 uppercase">房卡餘額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlayerRanking.map((row) => (
                <tr key={row.playerId}>
                  <td className="px-4 py-2 text-center">{row.rank}</td>
                  <td className="px-4 py-2 text-gray-900">{row.nickname} ({row.userId})</td>
                  <td className="px-4 py-2 text-center">{row.totalScore}</td>
                  <td className="px-4 py-2 text-center">{row.bigWinnerCount}</td>
                  <td className="px-4 py-2 text-center">{row.gameCount}</td>
                  <td className="px-4 py-2 text-center">{row.cardCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

