'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Edit, Trash2, Plus, Search, History, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { apiGet, apiDelete } from '@/lib/api-client'
import { useAdminListUiPersistence } from '@/lib/use-admin-list-ui-persistence'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import CreateUserModal from './components/CreateUserModal'
import EditUserModal from './components/EditUserModal'
import CardRechargeHistoryModal from './components/CardRechargeHistoryModal'
import PlayerClubsModal from './components/PlayerClubsModal'
import PlayerReferralsModal from './components/PlayerReferralsModal'
import Image from 'next/image'

interface AccountDeletionRequestRow {
  id: string
  playerId: string
  playerUserId: string
  playerNickname: string
  submittedNickname: string
  submittedUserId: string
  reason: string
  status: string
  statusLabel: string
  createdAt: string
  scheduledDeletionAt: string
  revokedAt: string | null
}

interface Player {
  id: string
  userId: string
  nickname: string
  cardCount: number
  maxJoinClubCount: number
  bio?: string | null
  avatarUrl?: string | null
  lineUserId?: string | null
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
  totalRechargeAmount: number
  averageMonthlyRecharge: number
  referralCount?: number
  phoneE164?: string | null
  currentClubs: Array<{
    id: string
    clubId: string
    name: string
  }>
}

export default function UserManagementPage() {
  const { ready: listUiReady, searchKeyword, setSearchKeyword, page, setPage } =
    useAdminListUiPersistence('user-management')
  const [loading, setLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const pageSize = 100

  // 玩家資料
  const [players, setPlayers] = useState<Player[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  // Modal 狀態
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null)
  const [clubsModalOpen, setClubsModalOpen] = useState(false)
  const [viewingPlayerClubs, setViewingPlayerClubs] = useState<{
    player: Player
    clubs: any[]
  } | null>(null)
  
  // Referral Modal
  const [referralsModalOpen, setReferralsModalOpen] = useState(false)
  const [viewingPlayerReferrals, setViewingPlayerReferrals] = useState<{id: string, name: string} | null>(null)

  const [accountDeletionRequests, setAccountDeletionRequests] = useState<AccountDeletionRequestRow[]>([])
  const [accountDeletionLoading, setAccountDeletionLoading] = useState(false)

  const fetchAccountDeletionRequests = useCallback(async () => {
    setAccountDeletionLoading(true)
    try {
      const response = await apiGet('/api/admin/account-deletion-requests')
      if (response.ok) {
        const result = await response.json()
        setAccountDeletionRequests(result.data || [])
      } else {
        console.error('獲取帳號刪除申請失敗')
      }
    } catch (e) {
      console.error('獲取帳號刪除申請失敗', e)
    } finally {
      setAccountDeletionLoading(false)
    }
  }, [])

  // 獲取玩家列表
  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiGet('/api/players')
      if (response.ok) {
        const result = await response.json()
        setPlayers(result.data || [])
      } else {
        const result = await response.json()
        console.error('獲取玩家列表失敗:', result.error || '未知錯誤')
      }
    } catch (error) {
      console.error('獲取玩家列表失敗:', error)
    } finally {
      setLoading(false)
      setDataLoaded(true)
    }
  }, [])

  // 初始化載入（還原搜尋／頁碼後再打 API）
  useEffect(() => {
    if (!listUiReady) return
    fetchPlayers()
  }, [listUiReady, fetchPlayers])

  useEffect(() => {
    fetchAccountDeletionRequests()
  }, [fetchAccountDeletionRequests])

  // 全選處理
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedItems(pagedData.map(item => item.id))
    } else {
      setSelectedItems([])
    }
  }

  // 單選處理
  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id])
    } else {
      setSelectedItems(selectedItems.filter(item => item !== id))
      setSelectAll(false)
    }
  }

  // 編輯玩家
  const handleEdit = (player: Player) => {
    setEditingPlayer(player)
    setEditModalOpen(true)
  }

  // 查看補卡紀錄
  const handleViewHistory = (player: Player) => {
    setViewingPlayerId(player.id)
    setHistoryModalOpen(true)
  }

  // 查看玩家加入的俱樂部
  const handleViewClubs = async (player: Player) => {
    try {
      const response = await apiGet(`/api/players/${player.id}/clubs`)
      if (response.ok) {
        const result = await response.json()
        setViewingPlayerClubs({
          player,
          clubs: result.data || []
        })
        setClubsModalOpen(true)
      } else {
        const result = await response.json()
        console.error('獲取玩家俱樂部列表失敗:', result.error || '未知錯誤')
        alert(result.error || '獲取玩家俱樂部列表失敗')
      }
    } catch (error) {
      console.error('獲取玩家俱樂部列表失敗:', error)
      alert('獲取玩家俱樂部列表失敗')
    }
  }
  
  // 查看推廣紀錄
  const handleViewReferrals = (player: Player) => {
    setViewingPlayerReferrals({ id: player.id, name: player.nickname })
    setReferralsModalOpen(true)
  }

  // 刪除玩家
  const handleDelete = async (id: string) => {
    const opCode = await requestAdminOpCode('確定要刪除此玩家嗎？')
    if (!opCode) {
      return
    }

    try {
      const response = await apiDelete(`/api/players/${id}`, {
        headers: withAdminOpCodeHeader(opCode),
      })
      if (response.ok) {
        alert('刪除成功')
        fetchPlayers()
      } else {
        const result = await response.json()
        alert(result.error || '刪除失敗')
      }
    } catch (error) {
      console.error('刪除玩家失敗:', error)
      alert('刪除失敗')
    }
  }

  // 批量刪除
  const handleBatchDelete = async () => {
    if (selectedItems.length === 0) {
      alert('請選擇要刪除的玩家')
      return
    }

    const opCode = await requestAdminOpCode(`確定要刪除 ${selectedItems.length} 個玩家嗎？`)
    if (!opCode) {
      return
    }

    try {
      const deletePromises = selectedItems.map((id) =>
        apiDelete(`/api/players/${id}`, {
          headers: withAdminOpCodeHeader(opCode),
        })
      )
      await Promise.all(deletePromises)
      alert('批量刪除成功')
      setSelectedItems([])
      setSelectAll(false)
      fetchPlayers()
    } catch (error) {
      console.error('批量刪除失敗:', error)
      alert('批量刪除失敗')
    }
  }

  // 搜尋處理
  const handleSearchChange = (keyword: string) => {
    setSearchKeyword(keyword)
    setSelectedItems([])
    setSelectAll(false)
    setPage(1)
  }

  // 顯示資料（根據搜尋關鍵字篩選）
  const displayData = players.filter((player) => {
    if (!searchKeyword.trim()) {
      return true
    }

    const keyword = searchKeyword.toLowerCase().trim()
    const nickname = (player.nickname || '').toLowerCase()
    const userId = player.userId.toLowerCase()

    return (
      nickname.includes(keyword) ||
      userId.includes(keyword)
    )
  })
  const total = displayData.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pagedData = displayData.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages, setPage])

  useEffect(() => {
    const currentPageIds = pagedData.map((item) => item.id)
    setSelectAll(currentPageIds.length > 0 && currentPageIds.every((id) => selectedItems.includes(id)))
  }, [pagedData, selectedItems])

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* 操作按鈕區域 */}
      <div className="sticky top-0 z-10 bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* 搜尋框 */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜尋暱稱、使用者ID..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
              />
            </div>
          </div>

          {/* 分隔線 */}
          <div className="h-6 w-px bg-gray-300"></div>

          {/* 操作按鈕 */}
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1"
          >
            <Plus className="w-3.5 h-3.5" />
            新增使用者
          </button>

          <button
            onClick={fetchPlayers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>

          <button
            onClick={handleBatchDelete}
            disabled={selectedItems.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            刪除
          </button>
        </div>
      </div>

      {/* 帳號刪除申請 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-base font-semibold text-gray-900">帳號刪除申請</h2>
          <button
            type="button"
            onClick={() => fetchAccountDeletionRequests()}
            disabled={accountDeletionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${accountDeletionLoading ? 'animate-spin' : ''}`} />
            重新載入
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">申請時間</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">狀態</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">玩家 ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">暱稱</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">刪除原因</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">預定刪除</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">撤銷時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accountDeletionLoading && accountDeletionRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">載入中…</td>
                </tr>
              ) : accountDeletionRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-500">尚無申請紀錄</td>
                </tr>
              ) : (
                accountDeletionRequests.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">
                      {new Date(row.createdAt).toLocaleString('zh-TW', {
                        timeZone: 'Asia/Taipei',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          row.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">{row.submittedUserId}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-800">{row.submittedNickname}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={row.reason}>{row.reason}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {new Date(row.scheduledDeletionAt).toLocaleString('zh-TW', {
                        timeZone: 'Asia/Taipei',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {row.revokedAt
                        ? new Date(row.revokedAt).toLocaleString('zh-TW', {
                            timeZone: 'Asia/Taipei',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 數據表格 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-center border-r border-gray-200 w-[60px]">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[80px]">
                  序號
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  使用者ID
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[80px]">
                  頭像
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  玩家名稱
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  當前房卡數量
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  備註
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  加入的俱樂部
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[100px]">
                  推廣人數
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                  總補卡數
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                  平均月耗卡量
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[180px]">
                  最後登入時間
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-[200px]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && !dataLoaded ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2">載入中...</span>
                    </div>
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-500">
                    暫無數據
                  </td>
                </tr>
              ) : (
                pagedData.map((item, index) => (
                  <tr key={item.id} className={`hover:bg-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 w-[60px]">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {(page - 1) * pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.userId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200">
                      {item.avatarUrl ? (
                        <Image
                          src={item.avatarUrl}
                          alt={item.nickname}
                          width={40}
                          height={40}
                          className="w-10 h-10 rounded-full mx-auto object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full mx-auto bg-gray-300 flex items-center justify-center text-gray-600 text-xs">
                          無
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      <div className="flex items-center justify-center gap-2">
                        <span>{item.nickname}</span>
                        {item.lineUserId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            LINE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.cardCount}
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200 text-gray-900 max-w-[200px]">
                      <div className="truncate" title={item.bio || ''}>
                        {item.bio || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleViewClubs(item)}
                          className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                        >
                          <Users className="w-4 h-4" />
                          <span className="text-sm">{item.currentClubs.length} 個</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleViewReferrals(item)}
                          className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors font-medium hover:underline"
                        >
                          {item.referralCount || 0}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.totalRechargeAmount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.averageMonthlyRecharge.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.lastLoginAt
                        ? new Date(item.lastLoginAt).toLocaleString('zh-TW', {
                          timeZone: 'Asia/Taipei',
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : '尚未登入'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                          編輯
                        </button>
                        <button
                          onClick={() => handleViewHistory(item)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded transition-colors"
                        >
                          <History className="w-3 h-3" />
                          補卡紀錄
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
        <span>
          共 {total} 筆，第 {page} / {totalPages} 頁
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            上一頁
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-md bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-40"
          >
            下一頁
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 創建使用者 Modal */}
      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false)
          fetchPlayers()
        }}
      />

      {/* 編輯使用者 Modal */}
      <EditUserModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingPlayer(null)
        }}
        onSuccess={() => {
          setEditModalOpen(false)
          setEditingPlayer(null)
          fetchPlayers()
        }}
        player={editingPlayer}
      />

      {/* 補卡紀錄 Modal */}
      <CardRechargeHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false)
          setViewingPlayerId(null)
        }}
        playerId={viewingPlayerId || ''}
      />

      {/* 玩家加入的俱樂部 Modal */}
      <PlayerClubsModal
        isOpen={clubsModalOpen}
        onClose={() => {
          setClubsModalOpen(false)
          setViewingPlayerClubs(null)
        }}
        clubs={viewingPlayerClubs?.clubs || []}
        playerName={viewingPlayerClubs?.player.nickname || ''}
      />
      
      {/* 推廣紀錄 Modal */}
      <PlayerReferralsModal
        isOpen={referralsModalOpen}
        onClose={() => {
          setReferralsModalOpen(false)
          setViewingPlayerReferrals(null)
        }}
        playerId={viewingPlayerReferrals?.id || ''}
        playerName={viewingPlayerReferrals?.name || ''}
      />
    </div>
  )
}
