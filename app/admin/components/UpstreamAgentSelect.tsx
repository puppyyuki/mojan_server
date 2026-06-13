'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
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

type DropdownRect = {
  top: number
  left: number
  width: number
}

type UpstreamAgentSelectProps = {
  /** 俱樂部 DB id；有值時才依該俱樂部 AgentClubBinding 載入候選 */
  clubDbId?: string | null
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
  return `${c.nickname}（${c.userId}）· ${c.agentLevelLabel}`
}

export default function UpstreamAgentSelect({
  clubDbId = null,
  excludePlayerDbId,
  valuePlayerDbId,
  onPick,
  disabled = false,
  showLabel = true,
}: UpstreamAgentSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateDropdownRect = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  const load = useCallback(async () => {
    if (!clubDbId) {
      setCandidates([])
      setLoadError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ clubId: clubDbId })
      if (excludePlayerDbId) {
        params.set('excludePlayerId', excludePlayerDbId)
      }
      const res = await apiGet(
        `/api/admin/upstream-agent-candidates?${params.toString()}`
      )
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
  }, [clubDbId, excludePlayerDbId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!clubDbId) {
      setText('')
      setOpen(false)
    }
  }, [clubDbId])

  useEffect(() => {
    const c =
      valuePlayerDbId !== null
        ? candidates.find((x) => x.id === valuePlayerDbId)
        : null
    if (valuePlayerDbId && c) {
      setText(canonDisplay(c))
    }
  }, [valuePlayerDbId, candidates])

  useLayoutEffect(() => {
    if (!open) return
    updateDropdownRect()
    const onScrollOrResize = () => updateDropdownRect()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updateDropdownRect, candidates.length])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!open) return
      const t = e.target
      if (!(t instanceof Node)) return
      if (anchorRef.current?.contains(t)) return
      if (dropdownRef.current?.contains(t)) return
      setOpen(false)
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
    valuePlayerDbId !== null
      ? candidates.find((x) => x.id === valuePlayerDbId)
      : undefined

  const onInputChange = (v: string) => {
    setText(v)
    setOpen(true)
    const t = v.trim()
    if (!t) {
      onPick(null)
      return
    }
    if (valuePlayerDbId && picked) {
      if (canonDisplay(picked).toLowerCase().trim() === v.trim().toLowerCase()) {
        return
      }
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
    Boolean(valuePlayerDbId && picked) && !disabled && !loading && Boolean(clubDbId)

  const inputDisabled = disabled || loading || !clubDbId

  const dropdownList =
    open && !inputDisabled && !loadError && dropdownRect && mounted
      ? createPortal(
          <ul
            ref={dropdownRef}
            id={listboxId}
            style={{
              position: 'fixed',
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              zIndex: 9999,
            }}
            className="max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
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
                    aria-selected={valuePlayerDbId === c.id}
                    className={`w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 ${
                      valuePlayerDbId === c.id ? 'bg-amber-50' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCandidate(c)}
                  >
                    {c.nickname}（{c.userId}）· {c.agentLevelLabel} ·{' '}
                    {shortId(c.id)}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body
        )
      : null

  return (
    <div className="space-y-2">
      {showLabel && (
        <label
          htmlFor={`${listboxId}-input`}
          className="block text-sm font-medium text-gray-700"
        >
          上層代理
        </label>
      )}

      <div ref={anchorRef} className="relative">
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="text"
          role="combobox"
          disabled={inputDisabled}
          value={text}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => {
            if (clubDbId) setOpen(true)
          }}
          placeholder={
            !clubDbId
              ? '請先選擇俱樂部'
              : loading
                ? '載入候選中…'
                : '輸入暱稱、玩家 ID 或層級篩選'
          }
          className={`w-full py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white disabled:opacity-60 placeholder:text-gray-400 ${
            showClear ? 'pl-3 pr-14' : 'px-3'
          }`}
          autoComplete="off"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={listboxId}
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
      </div>

      {dropdownList}

      {loadError && <p className="text-xs text-red-600">{loadError}</p>}
      <p className="text-xs text-gray-500">
        依所選俱樂部之 AgentClubBinding 顯示八階代理層級；下拉可超出對話框並捲動瀏覽。
      </p>
    </div>
  )
}
