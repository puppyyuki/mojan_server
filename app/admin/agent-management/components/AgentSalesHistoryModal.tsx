'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { apiGet } from '@/lib/api-client'

interface SalesRecord {
    id: string
    date: string
    time: string
    buyerUserId: string
    buyerName: string
    cardAmount: number
    status: string
    createdAt: string
}

interface AgentSalesHistoryModalProps {
    isOpen: boolean
    onClose: () => void
    agentId: string
}

export default function AgentSalesHistoryModal({
    isOpen,
    onClose,
    agentId,
}: AgentSalesHistoryModalProps) {
    const [loading, setLoading] = useState(false)
    const [records, setRecords] = useState<SalesRecord[]>([])

    useEffect(() => {
        const fetchSalesHistory = async () => {
            if (!isOpen || !agentId) return

            setLoading(true)
            try {
                const response = await apiGet(`/api/admin/agents/${agentId}/sales-history`)
                if (response.ok) {
                    const result = await response.json()
                    if (result.success) {
                        setRecords(result.data.records)
                    }
                } else {
                    alert('獲取售卡紀錄失敗')
                }
            } catch (error) {
                console.error('獲取售卡紀錄失敗:', error)
                alert('獲取售卡紀錄失敗')
            } finally {
                setLoading(false)
            }
        }

        fetchSalesHistory()
    }, [isOpen, agentId])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                {/* 標題 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">售卡紀錄</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 內容 */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            <span className="ml-3 text-gray-600">載入中...</span>
                        </div>
                    ) : records.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            暫無售卡紀錄
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            日期
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            時間
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            買家ID
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            買家名稱
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            售卡數量
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            狀態
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {records.map((record) => (
                                        <tr key={record.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                                {record.date}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                                {record.time}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                                {record.buyerUserId}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                                {record.buyerName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                                                {record.cardAmount}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${record.status === 'COMPLETED'
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                    }`}>
                                                    {record.status === 'COMPLETED' ? '已完成' : record.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* 底部按鈕 */}
                <div className="flex border-t border-gray-200 px-6 py-4">
                    <button
                        onClick={onClose}
                        className="ml-auto px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>
    )
}
