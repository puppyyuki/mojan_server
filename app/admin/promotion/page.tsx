'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Megaphone, RefreshCw, Search, ChevronDown, ChevronRight, ChevronLeft, UserPlus } from 'lucide-react'
import { apiGet } from '@/lib/api-client'

interface ReferredPlayer {
  id: string
  userId: string
  nickname: string
  registeredAt: string
  hasBoundReferrer: boolean
  hasBoundPhone?: boolean
}

interface PromoterRow {
  playerId: string
  referralCode: string
  nickname: string
  referralCount: number
  selfBoundReferrer: boolean
  referredPlayers: ReferredPlayer[]
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
  })
}

export default function PromotionPage() {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PromoterRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 15
  const [keywordDraft, setKeywordDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      q.set('page', String(page))
      q.set('pageSize', String(pageSize))
      if (keyword.trim()) q.set('keyword', keyword.trim())
      const res = await apiGet(`/api/admin/referrals/overview?${q.toString()}`)
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
  }, [page, keyword])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const toggleExpand = (id: string) => {
    setExpanded((m) => ({ ...m, [id]: !m[id] }))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const inputBase =
    'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 rounded shadow-sm'

  return (
    <div className="p-6 bg-gray-50 min-h-screen text-gray-900">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-50 text-violet-700">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">推廣總覽</h2>
            <p className="text-sm text-gray-600 mt-1">
              對應 App「獎勵」：新玩家輸入邀請碼可獲 <strong className="text-gray-800">6</strong> 張房卡；邀請人須待下線
              <strong className="text-gray-800">完成手機綁定</strong>後才累計 <code className="bg-gray-100 text-gray-800 px-1 rounded">referralCount</code> 並獲得
              <strong className="text-gray-800"> 2 </strong>
              張房卡（每名下線一次）。此處列出至少有一名「已輸入邀請碼」下線的邀請人。
            </p>
            <ul className="mt-3 text-xs text-gray-500 list-disc list-inside space-y-1">
              <li>
                <strong>推廣成功人數</strong>欄＝遊戲內有效推薦（下線已綁手機），與 <code className="bg-gray-100 px-1 rounded">referralCount</code> 一致。
              </li>
              <li>下線列表含手機綁定狀態；補卡紀錄見「補卡」與玩家「補卡紀錄」（備註：邀請碼綁定獎勵／推薦獎勵-被推薦人已綁定手機 等）。</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">搜尋推廣人（邀請碼／暱稱）</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setKeyword(keywordDraft)
                    setPage(1)
                  }
                }}
                placeholder="6 碼或暱稱片段"
                className={`pl-8 pr-3 py-1.5 text-sm w-56 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${inputBase}`}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setKeyword(keywordDraft)
              setPage(1)
            }}
            className="px-3 py-1.5 bg-slate-700 text-white text-sm rounded hover:bg-slate-800"
          >
            搜尋
          </button>
          <button
            type="button"
            onClick={() => fetchList()}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新整理
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">符合條件共 {total} 位推廣人（至少 1 名下線已輸入邀請碼）</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 w-10" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">邀請碼（使用者 ID）</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">推廣人暱稱</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 justify-center">
                    <UserPlus className="w-3.5 h-3.5" />
                    有效推薦人數
                  </span>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase whitespace-nowrap">本人已綁定邀請碼</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin inline mr-2" />
                    載入中…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    尚無推廣紀錄或無符合搜尋條件的玩家
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => {
                  const open = expanded[row.playerId]
                  return (
                    <Fragment key={row.playerId}>
                      <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/80'}>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.playerId)}
                            className="p-1 rounded hover:bg-gray-200 text-gray-600"
                            aria-label={open ? '收合' : '展開下線'}
                          >
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-900">{row.referralCode}</td>
                        <td className="px-4 py-2 text-gray-900">{row.nickname}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="inline-flex min-w-[2rem] justify-center px-2 py-0.5 rounded-full bg-violet-100 text-violet-900 font-semibold text-sm">
                            {row.referralCount}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-gray-600">{row.selfBoundReferrer ? '是' : '否'}</td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={5} className="px-4 py-3 border-t border-slate-100">
                            <div className="text-xs font-medium text-gray-500 mb-2">推廣成功玩家（下線）</div>
                            {row.referredPlayers.length === 0 ? (
                              <p className="text-sm text-gray-500">無資料（資料可能不一致，請檢查資料庫）</p>
                            ) : (
                              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 text-xs text-gray-500">
                                    <tr>
                                      <th className="px-3 py-2 text-left">暱稱</th>
                                      <th className="px-3 py-2 text-left">使用者 ID</th>
                                      <th className="px-3 py-2 text-left">註冊時間</th>
                                      <th className="px-3 py-2 text-center">已綁定邀請</th>
                                      <th className="px-3 py-2 text-center">手機綁定</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {row.referredPlayers.map((p) => (
                                      <tr key={p.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-900">{p.nickname}</td>
                                        <td className="px-3 py-2 font-mono text-xs text-gray-900">{p.userId}</td>
                                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDt(p.registeredAt)}</td>
                                        <td className="px-3 py-2 text-center text-gray-800">{p.hasBoundReferrer ? '是' : '否'}</td>
                                        <td className="px-3 py-2 text-center text-gray-800">
                                          {p.hasBoundPhone ? '是' : '否'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
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
