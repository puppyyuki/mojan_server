'use client'

import { useEffect, useState } from 'react'

const PREFIX = 'mojan_admin_list_ui_v1:'

export type AdminListUi = {
  searchKeyword: string
  page: number
}

/**
 * 還原／儲存列表頁的搜尋與頁碼，切換頂部頁籤後返回同一後台頁時可保留輸入狀態。
 */
export function useAdminListUiPersistence(routeKey: string) {
  const key = `${PREFIX}${routeKey}`
  const [ready, setReady] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key)
      if (raw) {
        const p = JSON.parse(raw) as Partial<AdminListUi>
        if (typeof p.searchKeyword === 'string') setSearchKeyword(p.searchKeyword)
        if (typeof p.page === 'number' && p.page >= 1) setPage(p.page)
      }
    } catch {
      /* ignore */
    }
    setReady(true)
  }, [key])

  useEffect(() => {
    if (!ready) return
    const payload: AdminListUi = { searchKeyword, page }
    sessionStorage.setItem(key, JSON.stringify(payload))
  }, [key, ready, searchKeyword, page])

  return { ready, searchKeyword, setSearchKeyword, page, setPage }
}
