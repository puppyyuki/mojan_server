'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '@/lib/api-client'

export type UpstreamAgentChoice = {
  playerDbId: string
  userId: string
  nickname: string
  agentLevel: string
  agentLevelLabel: string
}

type Candidate = {
  id: string
  userId: string
  nickname: string
  agentLevel: string
  agentLevelLabel: string
}

type UpstreamAgentSelectProps = {
  /** 編輯／審核對象自己的玩家 DB id，會從清單排除 */
  excludePlayerDbId?: string
  /** 目前選取之玩家 DB id（若尚未選則 null） */
  valuePlayerDbId: string | null
  onPick: (choice: UpstreamAgentChoice | null) => void
  disabled?: boolean
  showLabel?: boolean
}

function shortId(dbId: string) {
  return dbId.length <= 10 ? dbId : `${dbId.slice(0, 8)}…`
}

function canonDisplay(c: Candidate) {
  return `${c.nickname}（${c.userId}）`
}

export default function UpstreamAgentSelect({
  excludePlayerDbId,
  valuePlayerDbId,
  onPick,
  disabled = false,
  showLabel = true,
}: UpstreamAgentSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 輸入框內容（篩選字串或已選對象的展示字串） */
  const [text, setText] = useState('')
  /** 是否已展開候選下拉 */
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const q = excludePlayerDbId
        ? `?excludePlayerId=${encodeURIComponent(excludePlayerDbId)}`
        : ''
      const res = await apiGet(`/api/admin/upstream-agent-candidates${q}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCandidates([])
        setLoadError(typeof json?.error === 'string' ? json.error : '載入失敗')
        return
      }
      if (json.success && Array.isArray(json.data)) {
        setCandidates(json.data)
      } else {
        setCandidates([])
      }
    } catch {
      setCandidates([])
      setLoadError('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [excludePlayerDbId])

  useEffect(() => {
    void load()
  }, [load])

  /** 外在 value 對應到候選時，將輸入框同步為規範顯示（不會在清空 value 時覆寫您正在輸入的篩選字串） */
  useEffect(() => {
    const c =
      valuePlayerDbId !== null ? candidates.find((x) => x.id === valuePlayerDbId) : null
    if (valuePlayerDbId && c) {
      setText(canonDisplay(c))
    }
  }, [valuePlayerDbId, candidates])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = anchorRef.current
      if (!el || !open) return
      const t = e.target
      if (t instanceof Node && !el.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) => {
      const n = c.nickname.toLowerCase()
      const u = c.userId.toLowerCase()
      const pid = c.id.toLowerCase()
      const lab = c.agentLevelLabel.toLowerCase()
      return (
        n.includes(q) ||
        u.includes(q) ||
        pid.includes(q) ||
        lab.includes(q)
      )
    })
  }, [candidates, text])

  const picked =
    valuePlayerDbId !== null ? candidates.find((x) => x.id === valuePlayerDbId) : undefined

  const onInputChange = (v: string) => {
    setText(v)
    setOpen(true)
    const t = v.trim()
    if (!t) {
      onPick(null)
      return
    }
    if (valuePlayerDbId && picked) {
      if (canonDisplay(picked).toLowerCase().trim() === v.trim().toLowerCase()) return
      onPick(null)
    }
  }

  const pickCandidate = (c: Candidate) => {
    onPick({
      playerDbId: c.id,
      userId: c.userId,
      nickname: c.nickname,
      agentLevel: c.agentLevel,
      agentLevelLabel: c.agentLevelLabel,
    })
    setText(canonDisplay(c))
    setOpen(false)
  }

  const showClear =
    Boolean(valuePlayerDbId && picked) && !disabled && !loading

  return (
    <div className="space-y-2">
      {showLabel && (
        <label className="block text-sm font-medium text-gray-700">上層代理</label>
      )}

      <div ref={anchorRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled || loading}
          value={text}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={
            loading
              ? '載入候選中…'
              : '留空即無上層代理 · 輸入暱稱、玩家 ID 或資料庫 id 篩選'
          }
          className={`w-full py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white disabled:opacity-60 placeholder:text-gray-400 ${
            showClear ? 'pl-3 pr-14' : 'px-3'
          }`}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />

        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            onClick={(e) => {
              e.stopPropagation()
              onPick(null)
              setText('')
              inputRef.current?.focus()
              setOpen(true)
            }}
          >
            清除
          </button>
        )}

        {open && !disabled && !loadError && (
          <ul
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {loading ? (
              <li className="px-3 py-2 text-xs text-gray-400">載入候選…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400">無符合項目</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    className={`w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 ${
                      valuePlayerDbId === c.id ? 'bg-amber-50' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCandidate(c)}
                  >
                    {c.nickname}（{c.userId}）· {c.agentLevelLabel} · {shortId(c.id)}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {loadError && <p className="text-xs text-red-600">{loadError}</p>}
      <p className="text-xs text-gray-500">
        僅列出已核准之代理；聚焦或輸入即顯示清單，點選一列即可完成指定。
      </p>
    </div>
  )
}
