'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import UpstreamAgentSelect, { type UpstreamAgentChoice } from '@/app/admin/components/UpstreamAgentSelect'
import { apiPost } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'

interface RoomCardBranchModalProps {
  isOpen: boolean
  clubId: string
  onClose: () => void
  onSaved: () => void
}

export default function RoomCardBranchModal({
  isOpen,
  clubId,
  onClose,
  onSaved,
}: RoomCardBranchModalProps) {
  const [selectedMaster, setSelectedMaster] = useState<UpstreamAgentChoice | null>(null)
  const [branchRoomCardFee, setBranchRoomCardFee] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setSelectedMaster(null)
    setBranchRoomCardFee('0')
  }, [isOpen])

  const handleSave = async () => {
    if (saving) return
    if (!selectedMaster) {
      alert('請選擇綁定的大代理')
      return
    }

    const fee = Number.parseFloat(branchRoomCardFee)
    if (!Number.isFinite(fee) || fee < 0) {
      alert('分支房卡費須為非負數')
      return
    }

    const opCode = await requestAdminOpCode('確定要儲存分支房卡設定嗎？')
    if (!opCode) return

    setSaving(true)
    try {
      const response = await apiPost(
        `/api/clubs/${clubId}/room-card-branches`,
        {
          masterAgentPlayerId: selectedMaster.playerDbId,
          branchRoomCardFee: fee,
        },
        { headers: withAdminOpCodeHeader(opCode) }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success === false) {
        alert(result.error || '儲存分支房卡設定失敗')
        return
      }
      alert(result.message || '分支房卡設定已儲存')
      onSaved()
      onClose()
    } catch (error) {
      console.error('儲存分支房卡設定失敗:', error)
      alert('儲存分支房卡設定失敗')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">添加房卡分支</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 transition-colors duration-200 hover:bg-gray-100"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              綁定的大代理
            </label>
            <UpstreamAgentSelect
              clubDbId={clubId}
              valuePlayerDbId={selectedMaster?.playerDbId ?? null}
              onPick={setSelectedMaster}
              disabled={saving}
              showLabel={false}
              agentLevelFilter="master"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              分支房卡費
            </label>
            <p className="mb-2 text-xs text-gray-500">
              針對此大代理往下的分支樹，設定獨立房卡費；預設 0。
            </p>
            <input
              type="number"
              value={branchRoomCardFee}
              onChange={(e) => setBranchRoomCardFee(e.target.value)}
              min={0}
              step="any"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors duration-200 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
