'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'

interface CreateClubModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  players: Array<{ id: string; userId: string; nickname: string }>
}

export default function CreateClubModal({
  isOpen,
  onClose,
  onSuccess,
  players
}: CreateClubModalProps) {
  const [name, setName] = useState<string>('')
  const [creatorId, setCreatorId] = useState<string>('')
  const [cardCount, setCardCount] = useState<string>('0')
  const [loading, setLoading] = useState<boolean>(false)

  const handleSave = async () => {
    if (loading) return

    if (!name.trim()) {
      alert('請輸入俱樂部名稱')
      return
    }

    if (!creatorId) {
      alert('請選擇創建者')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/clubs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          creatorId: creatorId,
        })
      })

      if (response.ok) {
        const result = await response.json()
        // 如果有設置房卡數量，更新它
        if (cardCount !== '0') {
          await fetch(`/api/clubs/${result.data.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cardCount: parseInt(cardCount),
            })
          })
        }
        alert(result.message || '創建成功')
        onSuccess()
        onClose()
        setName('')
        setCreatorId('')
        setCardCount('0')
      } else {
        const result = await response.json()
        alert(result.error || '創建失敗')
      }
    } catch (error) {
      console.error('創建俱樂部失敗:', error)
      alert('創建失敗')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

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
          <h3 className="text-lg font-semibold text-gray-900">添加俱樂部</h3>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              俱樂部名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="請輸入俱樂部名稱"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              創建者 <span className="text-red-500">*</span>
            </label>
            <select
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white"
            >
              <option value="">請選擇創建者</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.nickname} ({player.userId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              俱樂部房卡數量
            </label>
            <input
              type="number"
              value={cardCount}
              onChange={(e) => setCardCount(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
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

