'use client'

import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { apiPatch, apiPost } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import ClubSelect from '@/app/admin/components/ClubSelect'
import UpstreamAgentSelect from '@/app/admin/components/UpstreamAgentSelect'

export type PlayerClubUpstreamBindingRow = {
  id: string
  clubDbId: string
  clubId: string
  clubName: string
  upstreamAgent: {
    playerDbId: string
    userId: string
    nickname: string
  }
}

type AddPlayerClubUpstreamModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  playerDbId: string
  editing?: PlayerClubUpstreamBindingRow | null
  excludeClubDbIds?: string[]
}

export default function AddPlayerClubUpstreamModal({
  isOpen,
  onClose,
  onSuccess,
  playerDbId,
  editing = null,
  excludeClubDbIds = [],
}: AddPlayerClubUpstreamModalProps) {
  const [clubDbId, setClubDbId] = useState<string | null>(null)
  const [upstreamDbId, setUpstreamDbId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setClubDbId(editing.clubDbId)
      setUpstreamDbId(editing.upstreamAgent.playerDbId)
    } else {
      setClubDbId(null)
      setUpstreamDbId(null)
    }
  }, [isOpen, editing])

  const handleSave = async () => {
    if (loading) return

    if (!clubDbId) {
      alert('請選擇俱樂部')
      return
    }
    if (!upstreamDbId) {
      alert('請選擇上層代理')
      return
    }

    const opCode = await requestAdminOpCode(
      editing ? '確定要更新上層代理綁定嗎？' : '確定要添加上層代理綁定嗎？'
    )
    if (!opCode) return

    setLoading(true)
    try {
      const payload = {
        clubId: clubDbId,
        upstreamAgentPlayerId: upstreamDbId,
        adminOpCode: opCode,
      }

      const response = editing
        ? await apiPatch(
            `/api/admin/players/${playerDbId}/club-upstream-bindings/${editing.id}`,
            payload,
            { headers: withAdminOpCodeHeader(opCode) }
          )
        : await apiPost(
            `/api/admin/players/${playerDbId}/club-upstream-bindings`,
            payload,
            { headers: withAdminOpCodeHeader(opCode) }
          )

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        alert(result.error || '儲存失敗')
        return
      }

      alert(result.message || '儲存成功')
      onSuccess()
      onClose()
    } catch (error) {
      console.error(error)
      alert('儲存失敗')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const excluded = editing
    ? excludeClubDbIds.filter((id) => id !== editing.clubDbId)
    : excludeClubDbIds

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {editing ? '編輯上層代理綁定' : '添加上層代理'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <ClubSelect
            valueClubDbId={clubDbId}
            onPick={(c) => setClubDbId(c ? c.clubDbId : null)}
            disabled={loading}
            excludeClubDbIds={excluded}
          />

          <UpstreamAgentSelect
            excludePlayerDbId={playerDbId}
            valuePlayerDbId={upstreamDbId}
            onPick={(row) => setUpstreamDbId(row ? row.playerDbId : null)}
            disabled={loading}
          />
        </div>

        <div className="flex border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-4 text-gray-600 hover:text-gray-800 transition-colors duration-200 text-sm font-medium disabled:opacity-50"
          >
            取消
          </button>
          <div className="w-px bg-gray-200" />
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-4 text-blue-600 hover:text-blue-700 transition-colors duration-200 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
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
