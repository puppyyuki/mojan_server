'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Search,
  History,
  CheckCircle,
  XCircle,
  Clock,
  Edit,
  Trash2,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { apiGet, apiDelete } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import AgentReviewModal from './components/AgentReviewModal'
import AgentRechargeHistoryModal from './components/AgentRechargeHistoryModal'
import AgentSalesHistoryModal from './components/AgentSalesHistoryModal'
import EditAgentModal from './components/EditAgentModal'

interface Agent {
  id: string
  playerId: string
  playerDbId: string
  playerName: string
  fullName: string
  email: string
  phone: string
  note: string | null
  status: 'pending' | 'approved' | 'rejected'
  roomCardBalance: number
  totalRechargeAmount: number
  averageMonthlySales: number
  recentRechargeRecords: Array<{
    id: string
    date: string
    time: string
    adminUsername: string
    amount: number
    previousCount: number
    newCount: number
    createdAt: string
  }>
  lastLoginAt: string | null
  agentLevel: 'normal' | 'master' | 'vip' // 代理層級：normal (一般代理), master (大代理), vip (公關代理)
  maxClubCreateCount: number
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
}

export default function AgentManagementPage() {
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState<string>('')
  const [page, setPage] = useState(1)
  const pageSize = 100

  // Modal 狀態
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [reviewingAgent, setReviewingAgent] = useState<Agent | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [viewingAgentId, setViewingAgentId] = useState<string | null>(null)
  const [salesHistoryModalOpen, setSalesHistoryModalOpen] = useState(false)
  const [viewingSalesAgentId, setViewingSalesAgentId] = useState<string | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  // 獲取代理列表
  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiGet('/api/admin/agents')
      if (response.ok) {
        const result = await response.json()
        setAgents(result.data || [])
      } else {
        const result = await response.json()
        console.error('獲取代理列表失敗:', result.error || '未知錯誤')
      }
    } catch (error) {
      console.error('獲取代理列表失敗:', error)
    } finally {
      setLoading(false)
      setDataLoaded(true)
    }
  }, [])

  // 初始化載入
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // 搜尋處理
  const handleSearchChange = (keyword: string) => {
    setSearchKeyword(keyword)
    setPage(1)
  }

  // 顯示資料（根據搜尋關鍵字篩選）
  const displayData = agents.filter((agent) => {
    if (!searchKeyword.trim()) {
      return true
    }

    const keyword = searchKeyword.toLowerCase().trim()
    const playerName = (agent.playerName || '').toLowerCase()
    const playerId = agent.playerId.toLowerCase()
    const fullName = (agent.fullName || '').toLowerCase()
    const email = (agent.email || '').toLowerCase()

    return (
      playerName.includes(keyword) ||
      playerId.includes(keyword) ||
      fullName.includes(keyword) ||
      email.includes(keyword)
    )
  })
  const total = displayData.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pagedData = displayData.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  // 查看補卡紀錄
  const handleViewHistory = (agent: Agent) => {
    setViewingAgentId(agent.id)
    setHistoryModalOpen(true)
  }

  // 查看售卡紀錄
  const handleViewSalesHistory = (agent: Agent) => {
    setViewingSalesAgentId(agent.id)
    setSalesHistoryModalOpen(true)
  }

  // 審核代理
  const handleReview = (agent: Agent) => {
    setReviewingAgent(agent)
    setReviewModalOpen(true)
  }

  // 編輯代理（補卡）
  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent)
    setEditModalOpen(true)
  }

  // 刪除代理
  const handleDelete = async (id: string) => {
    const opCode = await requestAdminOpCode('確定要刪除此代理申請嗎？')
    if (!opCode) {
      return
    }

    try {
      const response = await apiDelete(`/api/admin/agents/${id}`, {
        headers: withAdminOpCodeHeader(opCode),
      })
      if (response.ok) {
        alert('刪除成功')
        fetchAgents()
      } else {
        const result = await response.json()
        alert(result.error || '刪除失敗')
      }
    } catch (error) {
      console.error('刪除代理失敗:', error)
      alert('刪除失敗')
    }
  }

  // 獲取狀態標籤
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            已批准
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            已拒絕
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            待審核
          </span>
        )
      default:
        return null
    }
  }

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
                placeholder="搜尋ID、管理者名稱、郵箱..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
              />
            </div>
          </div>

          {/* 分隔線 */}
          <div className="h-6 w-px bg-gray-300"></div>

          {/* 操作按鈕 */}
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded text-sm hover:bg-green-600 focus:outline-none focus:ring-1 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 數據表格 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[80px]">
                  序號
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  ID
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  管理者名稱
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  當前房卡量
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                  歷史補卡紀錄
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  售卡記錄
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  平均月售卡量
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                  代理層級
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
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2">載入中...</span>
                    </div>
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                    暫無數據
                  </td>
                </tr>
              ) : (
                pagedData.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {(page - 1) * pageSize + index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.playerId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.playerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-900">
                      {item.roomCardBalance}
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleViewHistory(item)}
                          className="flex items-center justify-center gap-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded px-2 py-1 transition-colors"
                        >
                          <History className="w-4 h-4" />
                          <span className="text-sm">查看紀錄</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleViewSalesHistory(item)}
                          className="flex items-center justify-center gap-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1 transition-colors"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span className="text-sm">查看紀錄</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200 text-gray-500">
                      {item.averageMonthlySales.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center border-r border-gray-200">
                      {item.status === 'approved' ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          item.agentLevel === 'vip'
                            ? 'bg-purple-100 text-purple-800'
                            : item.agentLevel === 'master'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {item.agentLevel === 'vip'
                            ? '公關代理'
                            : item.agentLevel === 'master'
                              ? '大代理'
                              : '一般代理'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
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
                          onClick={() => handleReview(item)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                        >
                          {item.status === 'pending' ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              審核
                            </>
                          ) : (
                            <>
                              {getStatusBadge(item.status)}
                            </>
                          )}
                        </button>
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

      {/* 審核 Modal */}
      <AgentReviewModal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false)
          setReviewingAgent(null)
        }}
        onSuccess={() => {
          setReviewModalOpen(false)
          setReviewingAgent(null)
          fetchAgents()
        }}
        agent={reviewingAgent}
      />

      {/* 補卡紀錄 Modal */}
      <AgentRechargeHistoryModal
        isOpen={historyModalOpen}
        onClose={() => {
          setHistoryModalOpen(false)
          setViewingAgentId(null)
        }}
        agentId={viewingAgentId || ''}
      />

      {/* 售卡紀錄 Modal */}
      <AgentSalesHistoryModal
        isOpen={salesHistoryModalOpen}
        onClose={() => {
          setSalesHistoryModalOpen(false)
          setViewingSalesAgentId(null)
        }}
        agentId={viewingSalesAgentId || ''}
      />

      {/* 編輯代理 Modal */}
      <EditAgentModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditingAgent(null)
        }}
        onSuccess={() => {
          setEditModalOpen(false)
          setEditingAgent(null)
          fetchAgents()
        }}
        agent={editingAgent}
      />
    </div>
  )
}
