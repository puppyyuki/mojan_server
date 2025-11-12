'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, CheckCircle, XCircle, Clock } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'

interface Agent {
  id: string
  playerId: string
  playerName: string
  email: string
  phone: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  totalSales: number
  totalRevenue: number
  roomCardBalance: number
}

export default function AgentManagementPage() {
  const [loading, setLoading] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState<string>('')

  // 獲取代理列表
  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      // TODO: 實現獲取代理列表的 API
      // const response = await apiGet('/api/admin/agents')
      // if (response.ok) {
      //   const result = await response.json()
      //   setAgents(result.data || [])
      // }
      
      // 暫時使用模擬數據
      setAgents([])
    } catch (error) {
      console.error('獲取代理列表失敗:', error)
    } finally {
      setLoading(false)
      setDataLoaded(true)
    }
  }, [])

  // 審核代理申請
  const handleApprove = async (agentId: string) => {
    if (!confirm('確定要批准此代理申請嗎？')) {
      return
    }

    try {
      // TODO: 實現批准代理申請的 API
      // const response = await apiPost(`/api/admin/agents/${agentId}/approve`, {})
      // if (response.ok) {
      //   alert('批准成功')
      //   fetchAgents()
      // } else {
      //   const result = await response.json()
      //   alert(result.error || '批准失敗')
      // }
      alert('批准功能開發中')
    } catch (error) {
      console.error('批准代理申請失敗:', error)
      alert('批准失敗')
    }
  }

  // 拒絕代理申請
  const handleReject = async (agentId: string) => {
    if (!confirm('確定要拒絕此代理申請嗎？')) {
      return
    }

    try {
      // TODO: 實現拒絕代理申請的 API
      // const response = await apiPost(`/api/admin/agents/${agentId}/reject`, {})
      // if (response.ok) {
      //   alert('拒絕成功')
      //   fetchAgents()
      // } else {
      //   const result = await response.json()
      //   alert(result.error || '拒絕失敗')
      // }
      alert('拒絕功能開發中')
    } catch (error) {
      console.error('拒絕代理申請失敗:', error)
      alert('拒絕失敗')
    }
  }

  // 初始化載入
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // 過濾數據
  const displayData = agents.filter(agent => {
    if (!searchKeyword) return true
    const keyword = searchKeyword.toLowerCase()
    return (
      agent.playerName.toLowerCase().includes(keyword) ||
      agent.email.toLowerCase().includes(keyword) ||
      agent.phone.includes(keyword)
    )
  })

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
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 標題和操作欄 */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">代理管理</h2>
          <div className="flex items-center gap-3">
            {/* 搜尋框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋代理..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* 刷新按鈕 */}
            <button
              onClick={fetchAgents}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {/* 內容區域 */}
        <div className="p-6">
          {!dataLoaded ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">載入中...</p>
              </div>
            </div>
          ) : displayData.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-gray-500 mb-2">
                  {searchKeyword ? '沒有找到符合條件的代理' : '暫無代理數據'}
                </p>
                {searchKeyword && (
                  <button
                    onClick={() => setSearchKeyword('')}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    清除搜尋條件
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      代理資訊
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      聯絡方式
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      狀態
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      銷售統計
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      房卡餘額
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayData.map((agent) => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {agent.playerName}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {agent.playerId}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{agent.email}</div>
                        <div className="text-sm text-gray-500">{agent.phone}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {getStatusBadge(agent.status)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          總銷售: {agent.totalSales}
                        </div>
                        <div className="text-sm text-gray-500">
                          總收入: NT$ {agent.totalRevenue}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {agent.roomCardBalance} 張
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        {agent.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApprove(agent.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              批准
                            </button>
                            <button
                              onClick={() => handleReject(agent.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              拒絕
                            </button>
                          </div>
                        )}
                        {agent.status === 'approved' && (
                          <button
                            onClick={() => {
                              // TODO: 實現查看詳情功能
                              alert('查看詳情功能開發中')
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            查看詳情
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
