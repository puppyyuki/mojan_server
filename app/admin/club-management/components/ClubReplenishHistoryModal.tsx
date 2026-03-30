'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { apiGet } from '@/lib/api-client'

interface ClubReplenishRecord {
  id: string
  sourceType: 'MEMBER_TRANSFER' | 'ADMIN_RECHARGE'
  date: string
  time: string
  actorNickname: string
  actorUserId: string
  amount: number
  playerPreviousCount: number | null
  playerNewCount: number | null
  clubPreviousCount: number
  clubNewCount: number
  note?: string
  createdAt: string
}

interface ClubReplenishHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  clubId: string
}

export default function ClubReplenishHistoryModal({
  isOpen,
  onClose,
  clubId,
}: ClubReplenishHistoryModalProps) {
  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<ClubReplenishRecord[]>([])

  useEffect(() => {
    const fetchHistory = async () => {
      if (!isOpen || !clubId) return

      setLoading(true)
      try {
        const response = await apiGet(`/api/clubs/${clubId}/replenish-history`)
        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            setRecords(result.data.records)
          }
        } else {
          alert('獲取俱樂部補卡紀錄失敗')
        }
      } catch (error) {
        console.error('獲取俱樂部補卡紀錄失敗:', error)
        alert('獲取俱樂部補卡紀錄失敗')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [isOpen, clubId])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] mx-auto shadow-xl relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">俱樂部補卡紀錄</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">載入中...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-gray-500">暫無補卡紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      日期
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      時間
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      來源
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      補卡成員
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      玩家ID
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      成員房卡前
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      轉入數
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      成員房卡後
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      俱樂部房卡前
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      俱樂部房卡後
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      備註
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-center text-gray-900">{record.date}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{record.time}</td>
                      <td className="px-3 py-2 text-center text-gray-700">
                        {record.sourceType === 'MEMBER_TRANSFER' ? '成員轉入' : '後台補卡'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-900 font-medium">
                        {record.actorNickname}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{record.actorUserId}</td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {record.playerPreviousCount ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-green-600 font-semibold">
                        +{record.amount}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-900 font-medium">
                        {record.playerNewCount ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {record.clubPreviousCount}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-900 font-medium">
                        {record.clubNewCount}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600 max-w-[220px] truncate" title={record.note || ''}>
                        {record.note?.trim() ? record.note : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex border-t border-gray-200 px-6 py-4">
          <button
            type="button"
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
