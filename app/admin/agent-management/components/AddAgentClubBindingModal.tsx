'use client'

import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { apiPatch, apiPost } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import ClubSelect from '@/app/admin/components/ClubSelect'
import UpstreamAgentSelect from '@/app/admin/components/UpstreamAgentSelect'
import AgentLevelSelect, {
  isSuperAgentLevel,
  type AgentLevelValue,
} from '@/app/admin/components/AgentLevelSelect'

export type AgentClubBindingRow = {
  id: string
  clubDbId: string
  clubId: string
  clubName: string
  agentLevel: string
  agentLevelLabel: string
  agentRoomCardFee: number
  agentPercentage: number
  upstreamAgent: {
    playerDbId: string
    userId: string
    nickname: string
  } | null
}

type AddAgentClubBindingModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  playerDbId: string
  editing?: AgentClubBindingRow | null
  excludeClubDbIds?: string[]
}

export default function AddAgentClubBindingModal({
  isOpen,
  onClose,
  onSuccess,
  playerDbId,
  editing = null,
  excludeClubDbIds = [],
}: AddAgentClubBindingModalProps) {
  const [clubDbId, setClubDbId] = useState<string | null>(null)
  const [upstreamDbId, setUpstreamDbId] = useState<string | null>(null)
  const [agentLevel, setAgentLevel] = useState<AgentLevelValue>('agent')
  const [agentRoomCardFee, setAgentRoomCardFee] = useState<string>('2')
  const [agentPercentage, setAgentPercentage] = useState<string>('2')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setClubDbId(editing.clubDbId)
      setUpstreamDbId(editing.upstreamAgent?.playerDbId ?? null)
      setAgentLevel(
        (['super', 'master', 'mid', 'small', 'agent'].includes(editing.agentLevel)
          ? editing.agentLevel
          : 'agent') as AgentLevelValue
      )
      setAgentRoomCardFee(String(editing.agentRoomCardFee ?? 2))
      setAgentPercentage(String(editing.agentPercentage ?? 2))
    } else {
      setClubDbId(null)
      setUpstreamDbId(null)
      setAgentLevel('agent')
      setAgentRoomCardFee('2')
      setAgentPercentage('2')
    }
  }, [isOpen, editing])

  useEffect(() => {
    if (isSuperAgentLevel(agentLevel)) {
      setUpstreamDbId(null)
    }
  }, [agentLevel])

  const handleSave = async () => {
    if (loading) return

    if (!clubDbId) {
      alert('請選擇俱樂部')
      return
    }

    if (!isSuperAgentLevel(agentLevel) && !upstreamDbId) {
      alert('請選擇上層代理')
      return
    }

    const feeParsed = Number.parseFloat(agentRoomCardFee)
    if (!Number.isFinite(feeParsed) || feeParsed < 0) {
      alert('代理房卡費須為非負數')
      return
    }

    const percentageParsed = Number.parseFloat(agentPercentage)
    if (!Number.isFinite(percentageParsed) || percentageParsed < 0) {
      alert('代理自摸抽須為非負數')
      return
    }

    const opCode = await requestAdminOpCode(
      editing ? '確定要更新俱樂部綁定嗎？' : '確定要新增俱樂部綁定嗎？'
    )
    if (!opCode) return

    setLoading(true)
    try {
      const payload = {
        clubId: clubDbId,
        agentLevel,
        upstreamAgentPlayerId: isSuperAgentLevel(agentLevel) ? null : upstreamDbId,
        agentRoomCardFee: feeParsed,
        agentPercentage: percentageParsed,
        adminOpCode: opCode,
      }

      const response = editing
        ? await apiPatch(
            `/api/admin/agents/club-bindings/${playerDbId}/${editing.id}`,
            payload,
            { headers: withAdminOpCodeHeader(opCode) }
          )
        : await apiPost(`/api/admin/agents/club-bindings/${playerDbId}`, payload, {
            headers: withAdminOpCodeHeader(opCode),
          })

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
            {editing ? '編輯俱樂部綁定' : '添加上層代理、房卡費、代理自摸抽'}
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

          <AgentLevelSelect
            value={agentLevel}
            onChange={setAgentLevel}
            disabled={loading}
          />

          {!isSuperAgentLevel(agentLevel) && (
            <UpstreamAgentSelect
              excludePlayerDbId={playerDbId}
              valuePlayerDbId={upstreamDbId}
              onPick={(row) => setUpstreamDbId(row ? row.playerDbId : null)}
              disabled={loading}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              代理房卡費
            </label>
            <p className="text-xs text-gray-500 mb-2">
              代理房卡費設定；預設 2。目前僅供後台儲存。
            </p>
            <input
              type="number"
              value={agentRoomCardFee}
              onChange={(e) => setAgentRoomCardFee(e.target.value)}
              placeholder="2"
              min={0}
              step="any"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              代理自摸抽（%）
            </label>
            <p className="text-xs text-gray-500 mb-2">
              請填原始贏分百分點；系統會依俱樂部「自摸抽（%）」換算成自摸抽池分配比例。例如俱樂部自摸抽 5%，填 1 代表拿池子的 20%。
            </p>
            <input
              type="number"
              value={agentPercentage}
              onChange={(e) => setAgentPercentage(e.target.value)}
              placeholder="2"
              min={0}
              step="any"
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
            />
          </div>
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
