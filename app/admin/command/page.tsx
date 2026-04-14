'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { V2_BIAS_PATTERN_OPTIONS } from '@/lib/v2-tile-bias-catalog'

type BiasRuleRow = {
  id: string
  playerId: string
  gameType: string
  phase: string
  patternIds: string[]
  combine: string
  probability: number
  weight: number
  priority: number
  enabled: boolean
  validFrom: string | null
  validTo: string | null
  createdAt: string
  updatedAt: string
  createdByUserId: string | null
  player: { id: string; userId: string; nickname: string }
}

type PlayerHit = {
  id: string
  userId: string
  nickname: string
}

const PATTERN_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  V2_BIAS_PATTERN_OPTIONS.map((p) => [p.id, p.label])
)

function phaseLabelZh(phase: string): string {
  if (phase === 'opening') return '開局配牌'
  if (phase === 'draw') return '摸牌'
  return phase
}

function gameTypeLabelZh(gt: string): string {
  if (gt === 'BOTH') return '南北皆可'
  if (gt === 'NORTHERN') return '僅北部'
  if (gt === 'SOUTHERN') return '僅南部'
  return gt
}

function combineLabelZh(c: string): string {
  if (c === 'all') return '全部符合（AND）'
  if (c === 'any') return '任一符合（OR）'
  return c
}

function patternIdsLabelZh(ids: string[]): string {
  return ids.map((id) => PATTERN_LABEL_BY_ID[id] ?? id).join('、')
}

function ruleNoEffectReason(rule: BiasRuleRow): string | null {
  const ids = Array.isArray(rule.patternIds) ? rule.patternIds : []
  if (!ids.length) return '未設定台型'
  const invalid = ids.filter((id) => {
    const opt = V2_BIAS_PATTERN_OPTIONS.find((p) => p.id === id)
    if (!opt) return true
    const phaseOk = rule.phase === 'opening' ? opt.opening : rule.phase === 'draw' ? opt.draw : false
    if (!phaseOk) return true
    if (rule.gameType === 'NORTHERN' && opt.southernOnly) return true
    if (rule.gameType === 'SOUTHERN' && opt.northernOnly) return true
    return false
  })
  if (invalid.length > 0) return `含不適用台型: ${invalid.join(', ')}`
  if (!(rule.probability > 0)) return '機率為 0，不會生效'
  const vf = rule.validFrom ? Date.parse(rule.validFrom) : NaN
  const vt = rule.validTo ? Date.parse(rule.validTo) : NaN
  if (Number.isFinite(vf) && Number.isFinite(vt) && vf > vt) return '生效日期區間無效（From > To）'
  return null
}

export default function CommandPage() {
  const [keyword, setKeyword] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [hits, setHits] = useState<PlayerHit[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerHit | null>(null)

  const [rules, setRules] = useState<BiasRuleRow[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [formPhase, setFormPhase] = useState<'opening' | 'draw'>('opening')
  const [formGameType, setFormGameType] = useState<'BOTH' | 'NORTHERN' | 'SOUTHERN'>('BOTH')
  const [formCombine, setFormCombine] = useState<'all' | 'any'>('all')
  const [formProbability, setFormProbability] = useState('0.8')
  const [formWeight, setFormWeight] = useState('100')
  const [formPriority, setFormPriority] = useState('10')
  const [formPatterns, setFormPatterns] = useState<string[]>(['opening_tenpai'])

  const searchAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const el = searchAnchorRef.current
      if (!el || hits.length === 0) return
      const t = e.target
      if (t instanceof Node && !el.contains(t)) setHits([])
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [hits.length])

  const patternChoices = useMemo(() => {
    return V2_BIAS_PATTERN_OPTIONS.filter((p) => {
      const phaseOk = formPhase === 'opening' ? p.opening : p.draw
      if (!phaseOk) return false
      if (formGameType === 'NORTHERN' && p.southernOnly) return false
      if (formGameType === 'SOUTHERN' && p.northernOnly) return false
      return true
    })
  }, [formPhase, formGameType])

  const loadRules = useCallback(async (playerId: string) => {
    setRulesLoading(true)
    setMessage(null)
    try {
      const res = await apiGet(
        `/api/admin/v2-tile-bias?playerId=${encodeURIComponent(playerId)}`
      )
      const j = await res.json()
      if (!res.ok) {
        setMessage(j.error ?? '載入規則失敗')
        setRules([])
        return
      }
      setRules(j.data ?? [])
    } catch {
      setMessage('載入規則失敗')
      setRules([])
    } finally {
      setRulesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedPlayer) void loadRules(selectedPlayer.id)
  }, [selectedPlayer, loadRules])

  const searchPlayers = async () => {
    const q = keyword.trim()
    if (q.length < 1) {
      setMessage('請輸入關鍵字（userId、暱稱或 id）')
      return
    }
    setSearchLoading(true)
    setMessage(null)
    try {
      const res = await apiGet(
        `/api/players?search=${encodeURIComponent(q)}&limit=30`
      )
      const j = await res.json()
      if (!res.ok) {
        setHits([])
        setMessage(j.error ?? '搜尋失敗')
        return
      }
      const list = (j.data ?? j.players ?? []) as PlayerHit[]
      setHits(Array.isArray(list) ? list : [])
      if (!list?.length) setMessage('查無玩家')
    } catch {
      setHits([])
      setMessage('搜尋失敗')
    } finally {
      setSearchLoading(false)
    }
  }

  const togglePattern = (id: string) => {
    setFormPatterns((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const submitCreate = async () => {
    if (!selectedPlayer) {
      setMessage('請先選擇玩家')
      return
    }
    const probability = Number(formProbability)
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      setMessage('機率須為 0–1')
      return
    }
    if (formPatterns.length === 0) {
      setMessage('請至少選一個台型')
      return
    }
    setMessage(null)
    const res = await apiPost('/api/admin/v2-tile-bias', {
      playerId: selectedPlayer.id,
      gameType: formGameType,
      phase: formPhase,
      patternIds: formPatterns,
      combine: formCombine,
      probability,
      weight: Number(formWeight) || 0,
      priority: Number(formPriority) || 0,
      enabled: true,
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(j.error ?? '建立失敗')
      return
    }
    setMessage('已新增規則')
    await loadRules(selectedPlayer.id)
  }

  const patchRule = async (id: string, patch: Record<string, unknown>) => {
    if (!selectedPlayer) return
    const res = await apiPatch(`/api/admin/v2-tile-bias/${id}`, patch)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(j.error ?? '更新失敗')
      return
    }
    setMessage('已更新')
    await loadRules(selectedPlayer.id)
  }

  const deleteRule = async (id: string) => {
    if (!selectedPlayer) return
    if (!confirm('確定刪除此規則？')) return
    const res = await apiDelete(`/api/admin/v2-tile-bias/${id}`)
    if (!res.ok) {
      setMessage('刪除失敗')
      return
    }
    setMessage('已刪除')
    await loadRules(selectedPlayer.id)
  }

  useEffect(() => {
    setFormPatterns((prev) => {
      const allowed = new Set(patternChoices.map((p) => p.id))
      const next = prev.filter((id) => allowed.has(id))
      if (next.length > 0) return next
      const first = patternChoices[0]?.id
      return first ? [first] : []
    })
  }, [patternChoices])

  const fieldClass =
    'mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

  return (
    <div className="mx-auto min-h-full max-w-6xl bg-gray-50 p-6 text-gray-900 antialiased">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">後台指令 · V2 牌型加權</h1>
      <p className="mb-6 text-sm leading-relaxed text-gray-700">
        設定指定玩家在開局或摸牌階段的台型機率。Colyseus 需設定{' '}
        <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm text-gray-900">
          V2_TILE_BIAS_RULES_URL
        </code>
        （完整路徑：
        <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm text-gray-900">
          /api/internal/v2-tile-bias/rules
        </code>
        ）與相同的{' '}
        <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm text-gray-900">
          V2_TILE_BIAS_INTERNAL_SECRET
        </code>
        ；部署後可呼叫 V2 服務{' '}
        <code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-sm text-gray-900">
          POST /v2/admin/refresh-tile-bias-rules
        </code>{' '}
        強制重新載入。
      </p>

      {message && (
        <div className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded px-3 py-2">
          {message}
        </div>
      )}

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium text-gray-900">1. 搜尋玩家</h2>
        <div ref={searchAnchorRef} className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-[200px] flex-1 rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="userId、暱稱或內部 id"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchPlayers()}
              autoComplete="off"
            />
            <button
              type="button"
              className="bg-gray-900 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={searchLoading}
              onClick={searchPlayers}
            >
              {searchLoading ? '搜尋中…' : '搜尋'}
            </button>
          </div>
          {hits.length > 0 && (
            <ul
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    className={`w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 ${
                      selectedPlayer?.id === p.id ? 'bg-amber-100 text-gray-900' : ''
                    }`}
                    onClick={() => {
                      setSelectedPlayer(p)
                      setHits([])
                    }}
                  >
                    {p.nickname}（{p.userId}）· {p.id.slice(0, 8)}…
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selectedPlayer && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-gray-800">
            <span>
              目前選擇：<span className="font-medium text-gray-900">{selectedPlayer.nickname}</span>
              （{selectedPlayer.userId}）
            </span>
            <button
              type="button"
              className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-amber-100"
              onClick={() => setSelectedPlayer(null)}
            >
              更換玩家
            </button>
          </div>
        )}
      </section>

      {selectedPlayer && (
        <>
          <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-medium text-gray-900">
              2. 新增規則 — {selectedPlayer.nickname}
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">階段</span>
                <select className={fieldClass} value={formPhase}
                  onChange={(e) => setFormPhase(e.target.value as 'opening' | 'draw')}
                >
                  <option value="opening">開局配牌（先 4+4 骨架，補花延續）</option>
                  <option value="draw">對局摸牌（每次摸牌至多一次交換）</option>
                </select>
              </label>
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">玩法</span>
                <select
                  className={fieldClass}
                  value={formGameType}
                  onChange={(e) =>
                    setFormGameType(e.target.value as 'BOTH' | 'NORTHERN' | 'SOUTHERN')
                  }
                >
                  <option value="BOTH">南北皆可</option>
                  <option value="NORTHERN">僅北部</option>
                  <option value="SOUTHERN">僅南部</option>
                </select>
              </label>
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">複合條件</span>
                <select
                  className={fieldClass}
                  value={formCombine}
                  onChange={(e) => setFormCombine(e.target.value as 'all' | 'any')}
                >
                  <option value="all">全部符合（AND）</option>
                  <option value="any">任一符合（OR）</option>
                </select>
              </label>
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">機率（0–1）</span>
                <input
                  className={fieldClass}
                  value={formProbability}
                  onChange={(e) => setFormProbability(e.target.value)}
                />
              </label>
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">權重（數字大優先）</span>
                <input
                  className={fieldClass}
                  value={formWeight}
                  onChange={(e) => setFormWeight(e.target.value)}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  當同一局有多位玩家皆可套用開局規則時，先比較權重，再比較優先序。
                </span>
              </label>
              <label className="block text-sm text-gray-800">
                <span className="font-medium text-gray-700">優先序（數字大優先）</span>
                <input
                  className={fieldClass}
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  後端會取整數；未另設上下限（資料庫約 ±21 億）。建議用 0–9999 分段即可。
                </span>
              </label>
            </div>
            <div className="mt-4">
              <span className="text-sm font-medium text-gray-700">台型（依階段篩選）</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {patternChoices.map((p) => (
                  <label
                    key={p.id}
                    className="inline-flex cursor-pointer items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={formPatterns.includes(p.id)}
                      onChange={() => togglePattern(p.id)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="mt-4 bg-emerald-700 text-white px-4 py-2 rounded"
              onClick={submitCreate}
            >
              新增規則
            </button>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-medium text-gray-900">3. 目前生效列表</h2>
            {rulesLoading ? (
              <p className="text-sm text-gray-600">載入中…</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-gray-600">尚無規則</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-gray-800">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-700">
                      <th className="py-2 pr-2">啟用</th>
                      <th className="py-2 pr-2">階段</th>
                      <th className="py-2 pr-2">玩法</th>
                      <th className="py-2 pr-2">台型</th>
                      <th className="py-2 pr-2">複合</th>
                      <th className="py-2 pr-2">機率</th>
                      <th className="py-2 pr-2">權重</th>
                      <th className="py-2 pr-2">優先序</th>
                      <th className="py-2 pr-2">生效檢查</th>
                      <th className="py-2 pr-2">更新</th>
                      <th className="py-2 pr-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        {(() => {
                          const noEffectReason = ruleNoEffectReason(r)
                          return (
                            <>
                        <td className="py-2 pr-2">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) =>
                              patchRule(r.id, { enabled: e.target.checked })
                            }
                          />
                        </td>
                        <td className="py-2 pr-2">{phaseLabelZh(r.phase)}</td>
                        <td className="py-2 pr-2">{gameTypeLabelZh(r.gameType)}</td>
                        <td
                          className="max-w-[min(28rem,85vw)] py-2 pr-2 text-gray-800"
                          title={Array.isArray(r.patternIds) ? r.patternIds.join(', ') : ''}
                        >
                          {Array.isArray(r.patternIds)
                            ? patternIdsLabelZh(r.patternIds)
                            : String(r.patternIds)}
                        </td>
                        <td className="py-2 pr-2">{combineLabelZh(r.combine)}</td>
                        <td className="py-2 pr-2">{r.probability}</td>
                        <td className="py-2 pr-2">{r.weight ?? 0}</td>
                        <td className="py-2 pr-2">{r.priority}</td>
                        <td className="py-2 pr-2 text-xs">
                          {noEffectReason ? (
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                              {noEffectReason}
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">
                              可生效
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs text-gray-600">
                          {new Date(r.updatedAt).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2">
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() => deleteRule(r.id)}
                          >
                            刪除
                          </button>
                        </td>
                            </>
                          )
                        })()}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-gray-600">
              稽核：createdByUserId 於建立時寫入管理員 User id。內部 API 僅回傳 enabled
              規則；關閉勾選即停止對 V2 生效。
            </p>
          </section>
        </>
      )}
    </div>
  )
}
