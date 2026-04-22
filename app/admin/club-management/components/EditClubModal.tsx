'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import Image from 'next/image'
import { apiPatch } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'

interface Club {
  id: string
  clubId: string
  joinRequiresOwnerApproval?: boolean
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
    player: {
      id: string
      userId: string
      nickname: string
    }
  }>
}

interface EditClubModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  club: Club | null
}

export default function EditClubModal({
  isOpen,
  onClose,
  onSuccess,
  club
}: EditClubModalProps) {
  const [editClubId, setEditClubId] = useState<string>('')
  const [joinRequiresApproval, setJoinRequiresApproval] = useState<boolean>(true)
  const [name, setName] = useState<string>('')
  const [cardCount, setCardCount] = useState<string>('0')
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && club) {
      setEditClubId(club.clubId)
      setJoinRequiresApproval(club.joinRequiresOwnerApproval !== false)
      setName(club.name)
      setCardCount(club.cardCount.toString())
      setAvatarUrl(club.avatarUrl || club.creator?.avatarUrl || '')
    }
  }, [isOpen, club])

  const handleClubIdChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setEditClubId(digits)
  }

  const handleSave = async () => {
    if (loading || !club) return

    if (!name.trim()) {
      alert('請輸入俱樂部名稱')
      return
    }

    const trimmedClubId = editClubId.trim()
    if (!/^\d{6}$/.test(trimmedClubId)) {
      alert('請輸入有效的 6 位數俱樂部 ID（僅數字）')
      return
    }

    const cardParsed = Number.parseInt(cardCount, 10)
    const cardSafe = Number.isFinite(cardParsed) ? cardParsed : 0

    const opCode = requestAdminOpCode(
      '確定要儲存俱樂部資料嗎？（含公開 ID、房卡、加入審核設定時須驗證）'
    )
    if (!opCode) {
      return
    }

    setLoading(true)
    try {
      const response = await apiPatch(`/api/clubs/${club.id}`, {
        name: name.trim(),
        cardCount: cardSafe,
        avatarUrl: avatarUrl.trim() || null,
        clubId: trimmedClubId,
        joinRequiresOwnerApproval: joinRequiresApproval,
      }, {
        headers: withAdminOpCodeHeader(opCode),
      })

      if (response.ok) {
        const result = await response.json()
        alert(result.message || '更新成功')
        onSuccess()
        onClose()
      } else {
        const result = await response.json()
        alert(result.error || '更新失敗')
      }
    } catch (error) {
      console.error('更新俱樂部失敗:', error)
      alert('更新失敗')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !club) return null

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
          <h3 className="text-lg font-semibold text-gray-900">編輯俱樂部</h3>
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
              創建者：<span className="font-semibold text-gray-900">{club.creator.nickname} ({club.creator.userId})</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              6 位數俱樂部 ID（公開） <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={editClubId}
              onChange={(e) => handleClubIdChange(e.target.value)}
              placeholder="請輸入 6 位數字"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400 tracking-widest font-mono"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">加入須經擁有者／管理員審核</p>
              <p className="text-xs text-gray-500 mt-0.5">
                關閉後，玩家輸入俱樂部 ID 將直接成為成員（仍受每人最多 3 個俱樂部限制）。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={joinRequiresApproval}
              onClick={() => setJoinRequiresApproval((v) => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                joinRequiresApproval ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  joinRequiresApproval ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              俱樂部頭像 URL
            </label>
            <input
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="請輸入頭像 URL（可選）"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
            {avatarUrl && (
              <div className="mt-2 flex justify-center">
                <Image
                  src={avatarUrl}
                  alt="頭像預覽"
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-300"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            )}
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

