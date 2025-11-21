'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Search, Eye, CheckCircle, XCircle, Clock, Filter } from 'lucide-react'
import { apiGet } from '@/lib/api-client'
import Image from 'next/image'

interface RoomCardOrder {
  id: string
  playerId: string
  player: {
    userId: string
    nickname: string
    avatarUrl: string | null
  }
  product: {
    id: string
    cardAmount: number
    price: number
  }
  merchantTradeNo: string
  ecpayTradeNo: string | null
  cardAmount: number
  price: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'
  paymentType: string | null
  virtualAccount: string | null
  bankCode: string | null
  expireDate: Date | null
  paidAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export default function PaymentManagementPage() {
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<RoomCardOrder[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedOrder, setSelectedOrder] = useState<RoomCardOrder | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  // 獲取訂單列表
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiGet('/api/admin/room-card-orders')
      if (response.ok) {
        const result = await response.json()
        setOrders(result.data || [])
      } else {
        const result = await response.json()
        console.error('獲取訂單列表失敗:', result.error || '未知錯誤')
      }
    } catch (error) {
      console.error('獲取訂單列表失敗:', error)
    } finally {
      setLoading(false)
      setDataLoaded(true)
    }
  }, [])

  // 初始化載入
  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // 搜尋處理
  const handleSearchChange = (keyword: string) => {
    setSearchKeyword(keyword)
  }

  // 顯示資料（根據搜尋關鍵字和狀態篩選）
  const displayData = orders.filter((order) => {
    const matchesSearch =
      searchKeyword === '' ||
      order.merchantTradeNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      order.player.nickname.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      order.player.userId.includes(searchKeyword) ||
      (order.ecpayTradeNo && order.ecpayTradeNo.toLowerCase().includes(searchKeyword.toLowerCase()))

    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // 狀態標籤樣式
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            已付款
          </span>
        )
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            待付款
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            失敗
          </span>
        )
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            <XCircle className="w-3 h-3 mr-1" />
            已取消
          </span>
        )
      default:
        return <span className="text-gray-500">{status}</span>
    }
  }

  // 格式化日期
  const formatDate = (date: Date | string | null) => {
    if (!date) return '-'
    const d = typeof date === 'string' ? new Date(date) : date
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 查看訂單詳情
  const handleViewDetail = (order: RoomCardOrder) => {
    setSelectedOrder(order)
    setDetailModalOpen(true)
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">金流管理</h2>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {/* 搜尋和篩選 */}
        <div className="mb-4 flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="搜尋訂單編號、玩家名稱、玩家ID或綠界交易編號..."
              value={searchKeyword}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">全部狀態</option>
            <option value="PENDING">待付款</option>
            <option value="PAID">已付款</option>
            <option value="FAILED">失敗</option>
            <option value="CANCELLED">已取消</option>
          </select>
        </div>

        {/* 數據表格 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[80px]">
                    序號
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                    訂單編號
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                    玩家資訊
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                    房卡數量
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                    金額
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[120px]">
                    付款狀態
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[150px]">
                    付款方式
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                    虛擬帳號/銀行代碼
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[200px]">
                    綠界交易編號
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[180px]">
                    建立時間
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap w-[180px]">
                    付款時間
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap w-[100px]">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && !dataLoaded ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                      載入中...
                    </td>
                  </tr>
                ) : displayData.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-8 text-center text-gray-500">
                      沒有找到訂單
                    </td>
                  </tr>
                ) : (
                  displayData.map((order, index) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {order.merchantTradeNo}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm border-r border-gray-200">
                        <div className="flex items-center justify-center gap-2">
                          {order.player.avatarUrl && (
                            <Image
                              src={order.player.avatarUrl}
                              alt={order.player.nickname}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <div className="text-left">
                            <div className="text-gray-900 font-medium">{order.player.nickname}</div>
                            <div className="text-gray-500 text-xs">ID: {order.player.userId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {order.cardAmount} 張
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        NT$ {order.price}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm border-r border-gray-200">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {order.paymentType || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {order.virtualAccount ? (
                          <div>
                            <div>{order.virtualAccount}</div>
                            {order.bankCode && (
                              <div className="text-xs text-gray-500">銀行: {order.bankCode}</div>
                            )}
                            {order.expireDate && (
                              <div className="text-xs text-gray-500">
                                期限: {formatDate(order.expireDate)}
                              </div>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900 border-r border-gray-200">
                        {order.ecpayTradeNo || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 border-r border-gray-200">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 border-r border-gray-200">
                        {formatDate(order.paidAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm border-r border-gray-200">
                        <button
                          onClick={() => handleViewDetail(order)}
                          className="text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1"
                        >
                          <Eye className="w-4 h-4" />
                          詳情
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 訂單詳情 Modal */}
      {detailModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">訂單詳情</h3>
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">訂單編號</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.merchantTradeNo}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">狀態</label>
                    <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">玩家名稱</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.player.nickname}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">玩家ID</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.player.userId}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">房卡數量</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.cardAmount} 張</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">金額</label>
                    <div className="mt-1 text-sm text-gray-900">NT$ {selectedOrder.price}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">付款方式</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.paymentType || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">綠界交易編號</label>
                    <div className="mt-1 text-sm text-gray-900">{selectedOrder.ecpayTradeNo || '-'}</div>
                  </div>
                  {selectedOrder.virtualAccount && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-700">虛擬帳號</label>
                        <div className="mt-1 text-sm text-gray-900">{selectedOrder.virtualAccount}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">銀行代碼</label>
                        <div className="mt-1 text-sm text-gray-900">{selectedOrder.bankCode || '-'}</div>
                      </div>
                      {selectedOrder.expireDate && (
                        <div>
                          <label className="text-sm font-medium text-gray-700">繳費期限</label>
                          <div className="mt-1 text-sm text-gray-900">
                            {formatDate(selectedOrder.expireDate)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700">建立時間</label>
                    <div className="mt-1 text-sm text-gray-900">
                      {formatDate(selectedOrder.createdAt)}
                    </div>
                  </div>
                  {selectedOrder.paidAt && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">付款時間</label>
                      <div className="mt-1 text-sm text-gray-900">
                        {formatDate(selectedOrder.paidAt)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  關閉
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
