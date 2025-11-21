'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Edit, Trash2, Plus, Search, Users } from 'lucide-react'
import { apiGet, apiDelete } from '@/lib/api-client'
import CreateClubModal from './components/CreateClubModal'
import EditClubModal from './components/EditClubModal'
import ClubMembersModal from './components/ClubMembersModal'
import Image from 'next/image'

interface Club {
  id: string
  clubId: string
  name: string
  creatorId: string
  creator: {
    id: string
    userId: string
    nickname: string
    avatarUrl?: string
  }
  cardCount: number
  avatarUrl?: string
  members: Array<{
    id: string
    player: {
      id: string
      userId: string
      nickname: string
      cardCount: number
    }
    joinedAt: string
  }>
  createdAt: string
  updatedAt: string
}

interface Player {
  id: string
  userId: string
  nickname: string
}

export default function ClubManagementPage() {
  const [loading, setLoading] = useState(false)
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)

  // 俱樂部資料
  const [clubs, setClubs] = useState<Club[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  // 搜尋狀態
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // Modal 狀態
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [editingClub, setEditingClub] = useState<Club | null>(null)
  const [viewingMembers, setViewingMembers] = useState<Club | null>(null)

  // 獲取俱樂部列表
  const fetchClubs = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiGet('/api/clubs')
      if (response.ok) {
        const result = await response.json()
        setClubs(result.data || [])
      } else {
        const result = await response.json()
        console.error('獲取俱樂部列表失敗:', result.error || '未知錯誤')
      }
    } catch (error) {
      console.error('獲取俱樂部列表失敗:', error)
    } finally {
      setLoading(false)
      setDataLoaded(true)
    }
  }, [])

  // 獲取玩家列表（用於創建俱樂部時選擇創建者）
  const fetchPlayers = useCallback(async () => {
    try {
      const response = await apiGet('/api/players')
      if (response.ok) {
        const result = await response.json()
        setPlayers(result.data || [])
      }
    } catch (error) {
      console.error('獲取玩家列表失敗:', error)
    }
  }, [])

  // 初始化載入
  useEffect(() => {
    fetchClubs()
    fetchPlayers()
  }, [fetchClubs, fetchPlayers])

  // 全選處理
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelectedItems(displayData.map(item => item.id))
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

  // 編輯俱樂部
  const handleEdit = (club: Club) => {
    setEditingClub(club)
    setEditModalOpen(true)
  }

  // 查看成員
  const handleViewMembers = (club: Club) => {
    setViewingMembers(club)
    setMembersModalOpen(true)
  }

  // 刪除俱樂部
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此俱樂部嗎？')) {
      return
    }

    try {
      const response = await apiDelete(`/api/clubs/${id}`)
      if (response.ok) {
        alert('刪除成功')
        fetchClubs()
      } else {
        const result = await response.json()
        alert(result.error || '刪除失敗')
      }
    } catch (error) {
      console.error('刪除俱樂部失敗:', error)
      alert('刪除失敗')
    }
  }

  // 批量刪除
  const handleBatchDelete = async () => {
    if (selectedItems.length === 0) {
      alert('請選擇要刪除的俱樂部')
      return
    }

    if (!confirm(`確定要刪除 ${selectedItems.length} 個俱樂部嗎？`)) {
      return
    }

    try {
      const deletePromises = selectedItems.map(id => apiDelete(`/api/clubs/${id}`))
      await Promise.all(deletePromises)
      alert('批量刪除成功')
      setSelectedItems([])
      setSelectAll(false)
      fetchClubs()
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
  }

  // 顯示資料（根據搜尋關鍵字篩選）
  const displayData = clubs.filter((club) => {
    if (!searchKeyword.trim()) {
      return true
    }

    const keyword = searchKeyword.toLowerCase().trim()
    const name = (club.name || '').toLowerCase()
    const clubId = club.clubId.toLowerCase()
    const creatorName = (club.creator?.nickname || '').toLowerCase()

    return (
      name.includes(keyword) ||
      clubId.includes(keyword) ||
      creatorName.includes(keyword)
    )
  })

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
                placeholder="搜尋俱樂部名稱、ID、創建者..."
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
            添加俱樂部
          </button>

          <button
            onClick={fetchClubs}
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

      {/* 數據表格 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] divide-y divide-gray-200">
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
                  俱樂部ID
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  俱樂部名稱
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  俱樂部成員
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  創建者
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                  創建者頭像
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  俱樂部房卡數量
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-[200px]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading && !dataLoaded ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2">載入中...</span>
                    </div>
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    暫無數據
                  </td>
                </tr>
              ) : (
                displayData.map((item, index) => (
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
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.clubId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleViewMembers(item)}
                          className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                        >
                          <Users className="w-4 h-4" />
                          <span className="text-sm">{item.members?.length || 0} 人</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.creator?.nickname || '-'} ({item.creator?.userId || '-'})
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200">
                      {(item.avatarUrl || item.creator?.avatarUrl) ? (
                        <div className="flex justify-center">
                          <Image
                            src={item.avatarUrl || item.creator?.avatarUrl}
                            alt="頭像"
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="%23ddd"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="%23999"%3E?%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                            無
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.cardCount}
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

      {/* 創建俱樂部 Modal */}
      <CreateClubModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false)
          fetchClubs()
        }}
        players={players}
      />

      {/* 編輯俱樂部 Modal */}
      <EditClubModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingClub(null)
        }}
        onSuccess={() => {
          setEditModalOpen(false)
          setEditingClub(null)
          fetchClubs()
        }}
        club={editingClub}
      />

      {/* 查看成員 Modal */}
      <ClubMembersModal
        isOpen={membersModalOpen}
        onClose={() => {
          setMembersModalOpen(false)
          setViewingMembers(null)
        }}
        members={viewingMembers?.members || []}
        clubName={viewingMembers?.name || ''}
      />
    </div>
  )
}
