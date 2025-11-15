'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'

interface Player {
  id: string
  userId: string
  nickname: string
  cardCount: number
  bio?: string | null
}

interface EditUserModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  player: Player | null
}

export default function EditUserModal({
  isOpen,
  onClose,
  onSuccess,
  player
}: EditUserModalProps) {
  const [nickname, setNickname] = useState<string>('')
  const [cardCount, setCardCount] = useState<string>('0')
  const [bio, setBio] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && player) {
      setNickname(player.nickname)
      setCardCount(player.cardCount.toString())
      setBio(player.bio || '')
    }
  }, [isOpen, player])

  const handleSave = async () => {
    if (loading || !player) return

    if (!nickname.trim()) {
      alert('請輸入暱稱')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/players/${player.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          cardCount: parseInt(cardCount),
          bio: bio.trim() || null,
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || '更新成功')
        onSuccess()
        onClose()
      } else {
        const result = await response.json().catch(() => ({ error: '未知錯誤' }))
        const errorMessage = result.error || `更新失敗 (HTTP ${response.status})`
        console.error('更新失敗:', errorMessage, result)
        alert(errorMessage)
      }
    } catch (error) {
      console.error('更新使用者失敗:', error)
      alert(`更新失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !player) return null

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
          <h3 className="text-lg font-semibold text-gray-900">編輯使用者</h3>
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
              使用者ID：<span className="font-semibold text-gray-900">{player.userId}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              使用者暱稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="請輸入暱稱"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              房卡數量
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              備註
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="請輸入備註..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400 resize-none"
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

