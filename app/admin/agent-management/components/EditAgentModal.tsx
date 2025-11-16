'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { apiPatch } from '@/lib/api-client'

interface Agent {
  id: string
  playerId: string
  playerDbId: string
  playerName: string
  roomCardBalance: number
}

interface EditAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  agent: Agent | null
}

export default function EditAgentModal({
  isOpen,
  onClose,
  onSuccess,
  agent
}: EditAgentModalProps) {
  const [cardCount, setCardCount] = useState<string>('0')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && agent) {
      setCardCount(agent.roomCardBalance.toString())
    }
  }, [isOpen, agent])

  const handleSave = async () => {
    if (loading || !agent) return

    setLoading(true)
    try {
      const response = await apiPatch(`/api/players/${agent.playerDbId}`, {
        cardCount: parseInt(cardCount),
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || '補卡成功')
        onSuccess()
        onClose()
      } else {
        const result = await response.json().catch(() => ({ error: '未知錯誤' }))
        const errorMessage = result.error || `補卡失敗 (HTTP ${response.status})`
        console.error('補卡失敗:', errorMessage, result)
        alert(errorMessage)
      }
    } catch (error) {
      console.error('補卡失敗:', error)
      alert(`補卡失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !agent) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">編輯代理（補卡）</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 內容 */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">
              代理ID：<span className="font-semibold text-gray-900">{agent.playerId}</span>
            </p>
            <p className="text-sm text-gray-600 mb-2">
              代理名稱：<span className="font-semibold text-gray-900">{agent.playerName}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              當前房卡數量
            </label>
            <input
              type="number"
              value={cardCount}
              onChange={(e) => setCardCount(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
            <p className="mt-1 text-xs text-gray-500">
              輸入新的房卡數量，系統會自動計算補卡數量並記錄
            </p>
          </div>
        </div>

        {/* 按鈕 */}
        <div className="flex border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-4 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
          >
            取消
          </button>
          <div className="w-px bg-gray-200"></div>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-4 text-blue-600 hover:text-blue-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                處理中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

