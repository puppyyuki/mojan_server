'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type SearchableOption = {
  value: string
  label: string
  hint?: string
}

type SearchableSelectProps = {
  label: string
  placeholder?: string
  value: string | null
  onChange: (value: string | null, option: SearchableOption | null) => void
  options: SearchableOption[]
  loading?: boolean
  loadError?: string | null
  disabled?: boolean
  helperText?: string
}

export default function SearchableSelect({
  label,
  placeholder = '輸入關鍵字篩選…',
  value,
  onChange,
  options,
  loading = false,
  loadError = null,
  disabled = false,
  helperText,
}: SearchableSelectProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  const picked = value !== null ? options.find((o) => o.value === value) : undefined

  useEffect(() => {
    if (value && picked) {
      setText(picked.label)
    } else if (!value) {
      setText('')
    }
  }, [value, picked])

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
    if (!q) return options
    return options.filter((o) => {
      const lab = o.label.toLowerCase()
      const hint = (o.hint || '').toLowerCase()
      const val = o.value.toLowerCase()
      return lab.includes(q) || hint.includes(q) || val.includes(q)
    })
  }, [options, text])

  const onInputChange = (v: string) => {
    setText(v)
    setOpen(true)
    const t = v.trim()
    if (!t) {
      onChange(null, null)
      return
    }
    if (value && picked && picked.label.toLowerCase().trim() === v.trim().toLowerCase()) return
    onChange(null, null)
  }

  const pickOption = (o: SearchableOption) => {
    onChange(o.value, o)
    setText(o.label)
    setOpen(false)
  }

  const showClear = Boolean(value && picked) && !disabled && !loading

  return (
    <div className="space-y-2">
      <label htmlFor={`${listboxId}-input`} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
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
          placeholder={loading ? '載入中…' : placeholder}
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
              onChange(null, null)
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
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {loading ? (
              <li className="px-3 py-2 text-xs text-gray-400">載入候選…</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400">無符合項目</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === o.value}
                    className={`w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100 ${
                      value === o.value ? 'bg-amber-50' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickOption(o)}
                  >
                    {o.label}
                    {o.hint ? (
                      <span className="block text-xs text-gray-400 mt-0.5">{o.hint}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}
      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
    </div>
  )
}

