'use client'

import { X } from 'lucide-react'

interface Club {
  id: string
  clubId: string
  name: string
  cardCount?: number
  creator?: {
    id: string
    userId: string
    nickname: string
  }
  members?: Array<{
    id: string
    player: {
      id: string
      userId: string
      nickname: string
    }
    joinedAt: string
  }>
}

interface PlayerClubsModalProps {
  isOpen: boolean
  onClose: () => void
  clubs: Club[]
  playerName: string
}

export default function PlayerClubsModal({
  isOpen,
  onClose,
  clubs,
  playerName
}: PlayerClubsModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-2xl mx-auto shadow-xl relative max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {playerName} - 加入的俱樂部 ({clubs.length})
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* 內容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {clubs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              暫無加入的俱樂部
            </div>
          ) : (
            <div className="space-y-2">
              {clubs.map((club, index) => (
                <div
                  key={club.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-sm text-gray-500 w-8">#{index + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {club.name || '未命名俱樂部'}
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {club.clubId} | 房卡: {club.cardCount ?? 0} | 成員: {club.members?.length ?? 0} 人
                      </p>
                      {club.creator && (
                        <p className="text-xs text-gray-400 mt-1">
                          創建者: {club.creator.nickname} ({club.creator.userId})
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full py-2 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm font-medium"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}

