'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { apiGet } from '@/lib/api-client'

export type ClubChoice = {
  clubDbId: string
  clubId: string
  name: string
  branchRoomCardEnabled?: boolean
}

type Candidate = {
  id: string
  clubId: string
  name: string
  branchRoomCardEnabled?: boolean
}

type ClubSelectProps = {
  valueClubDbId: string | null
  onPick: (choice: ClubChoice | null) => void
  disabled?: boolean
  showLabel?: boolean
  excludeClubDbIds?: string[]
}

function canonDisplay(c: Candidate) {
  return `${c.name}（${c.clubId}）`
}

export default function ClubSelect({
  valueClubDbId,
  onPick,
  disabled = false,
  showLabel = true,
  excludeClubDbIds = [],
}: ClubSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  const excludeSet = useMemo(() => new Set(excludeClubDbIds), [excludeClubDbIds])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiGet('/api/admin/club-candidates?limit=500')
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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const c =
      valueClubDbId !== null ? candidates.find((x) => x.id === valueClubDbId) : null
    if (valueClubDbId && c) {
      setText(canonDisplay(c))
    }
  }, [valueClubDbId, candidates])

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

  const available = useMemo(
    () => candidates.filter((c) => !excludeSet.has(c.id) || c.id === valueClubDbId),
    [candidates, excludeSet, valueClubDbId]
  )

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return available
    return available.filter((c) => {
      const n = c.name.toLowerCase()
      const cid = c.clubId.toLowerCase()
      const db = c.id.toLowerCase()
      return n.includes(q) || cid.includes(q) || db.includes(q)
    })
  }, [available, text])

  const picked =
    valueClubDbId !== null ? candidates.find((x) => x.id === valueClubDbId) : undefined

  const onInputChange = (v: string) => {
    setText(v)
    setOpen(true)
    const t = v.trim()
    if (!t) {
      onPick(null)
      return
    }
    if (valueClubDbId && picked) {
      if (canonDisplay(picked).toLowerCase().trim() === v.trim().toLowerCase()) return
      onPick(null)
    }
  }

  const pickCandidate = (c: Candidate) => {
    onPick({
      clubDbId: c.id,
      clubId: c.clubId,
      name: c.name,
      branchRoomCardEnabled: c.branchRoomCardEnabled === true,
    })
    setText(canonDisplay(c))
    setOpen(false)
  }

  const showClear = Boolean(valueClubDbId && picked) && !disabled && !loading

  return (
    <div className="space-y-2">
      {showLabel && (
        <label
          htmlFor={`${listboxId}-input`}
          className="block text-sm font-medium text-gray-700"
        >
          俱樂部 <span className="text-red-500">*</span>
        </label>
      )}

      <div ref={anchorRef} className="relative">
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="text"
          role="combobox"
          disabled={disabled || loading}
          value={text}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={
            loading
              ? '載入俱樂部中…'
              : '輸入俱樂部名稱或 6 位 ID 篩選'
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

        {open && !disabled && !loadError && (
          <ul
            id={listboxId}
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {loading ? (
              <li className="px-3 py-2 text-xs text-gray-400">載入中…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400">無符合項目</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={valueClubDbId === c.id}
                    className={`w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 ${
                      valueClubDbId === c.id ? 'bg-amber-50' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickCandidate(c)}
                  >
                    {c.name}（{c.clubId}）
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {loadError && <p className="text-xs text-red-600">{loadError}</p>}
    </div>
  )
}
