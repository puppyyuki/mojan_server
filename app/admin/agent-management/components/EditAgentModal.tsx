'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Save, Plus, Pencil, Trash2 } from 'lucide-react'
import { apiGet, apiPatch } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import AddAgentClubBindingModal, {
  type AgentClubBindingRow,
} from './AddAgentClubBindingModal'

type LegacyContext = {
  previousClub: { clubDbId: string; clubId: string; name: string } | null
  owners: Array<{ userId: string; nickname: string }>
  coLeaders: Array<{ userId: string; nickname: string }>
  legacyUpstreamAgent: {
    playerDbId: string
    userId: string
    nickname: string
  } | null
  legacyAgentLevel: string
  legacyAgentLevelLabel: string
}

interface Agent {
  id: string
  playerId: string
  playerDbId: string
  playerName: string
  roomCardBalance: number
  maxClubCreateCount?: number
  status?: 'pending' | 'approved' | 'rejected'
}

interface EditAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  agent: Agent | null
}

function formatPersonList(
  list: Array<{ userId: string; nickname: string }>
): string {
  if (list.length === 0) return '—'
  return list.map((p) => `${p.nickname}（${p.userId}）`).join('、')
}

export default function EditAgentModal({
  isOpen,
  onClose,
  onSuccess,
  agent,
}: EditAgentModalProps) {
  const [cardCount, setCardCount] = useState<string>('0')
  const [maxClubCreateCount, setMaxClubCreateCount] = useState<string>('1')
  const [loading, setLoading] = useState<boolean>(false)
  const [bindings, setBindings] = useState<AgentClubBindingRow[]>([])
  const [legacyContext, setLegacyContext] = useState<LegacyContext | null>(null)
  const [bindingsLoading, setBindingsLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingBinding, setEditingBinding] = useState<AgentClubBindingRow | null>(
    null
  )
  const [autoPrompted, setAutoPrompted] = useState(false)

  const loadBindings = useCallback(async () => {
    if (!agent) return
    setBindingsLoading(true)
    try {
      const res = await apiGet(`/api/admin/agents/club-bindings/${agent.playerDbId}`)
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.success) {
        setBindings(Array.isArray(json.data) ? json.data : [])
        setLegacyContext(json.legacyContext ?? null)
      }
    } catch (error) {
      console.error('load bindings failed', error)
    } finally {
      setBindingsLoading(false)
    }
  }, [agent])

  useEffect(() => {
    if (isOpen && agent) {
      setCardCount(agent.roomCardBalance.toString())
      setMaxClubCreateCount(
        Math.max(Number(agent.maxClubCreateCount ?? 1) || 1, 1).toString()
      )
      setAutoPrompted(false)
      void loadBindings()
    }
  }, [isOpen, agent, loadBindings])

  useEffect(() => {
    if (
      isOpen &&
      agent?.status === 'approved' &&
      !bindingsLoading &&
      bindings.length === 0 &&
      !autoPrompted
    ) {
      setAutoPrompted(true)
      setAddModalOpen(true)
    }
  }, [isOpen, agent, bindingsLoading, bindings.length, autoPrompted])

  const handleDeleteBinding = async (binding: AgentClubBindingRow) => {
    if (!agent) return
    if (!confirm(`確定要刪除俱樂部「${binding.clubName}」的綁定嗎？`)) return

    const opCode = await requestAdminOpCode('確定要刪除此俱樂部綁定嗎？')
    if (!opCode) return

    try {
      const res = await fetch(
        `/api/admin/agents/club-bindings/${agent.playerDbId}/${binding.id}`,
        {
          method: 'DELETE',
          headers: withAdminOpCodeHeader(opCode),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '刪除失敗')
        return
      }
      await loadBindings()
    } catch {
      alert('刪除失敗')
    }
  }

  const handleSave = async () => {
    if (loading || !agent) return

    if (agent.status === 'approved' && bindings.length === 0) {
      alert('請先完成至少一筆俱樂部綁定（上層代理、層級、房卡費）')
      setAddModalOpen(true)
      return
    }

    const opCode = await requestAdminOpCode('確定要調整代理資料或房卡嗎？')
    if (!opCode) return

    setLoading(true)
    try {
      const parsedMaxJoinClubCount = parseInt(maxClubCreateCount, 10)
      if (
        agent.status === 'approved' &&
        (!Number.isFinite(parsedMaxJoinClubCount) || parsedMaxJoinClubCount < 1)
      ) {
        alert('可創建俱樂部上限必須為大於等於 1 的整數')
        setLoading(false)
        return
      }

      const cardResponse = await apiPatch(
        `/api/players/${agent.playerDbId}`,
        { cardCount: parseInt(cardCount) },
        { headers: withAdminOpCodeHeader(opCode) }
      )

      if (!cardResponse.ok) {
        const result = await cardResponse.json().catch(() => ({ error: '未知錯誤' }))
        alert(result.error || '更新房卡失敗')
        setLoading(false)
        return
      }

      if (agent.status === 'approved') {
        const levelResponse = await apiPatch(`/api/admin/agents/${agent.id}/level`, {
          maxClubCreateCount: parsedMaxJoinClubCount,
        })

        if (!levelResponse.ok) {
          const result = await levelResponse.json().catch(() => ({}))
          console.error('更新可創建俱樂部上限失敗:', result)
        }
      }

      alert('更新成功')
      onSuccess()
      onClose()
    } catch (error) {
      console.error('更新失敗:', error)
      alert(`更新失敗: ${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !agent) return null

  const showLegacyBanner =
    agent.status === 'approved' && bindings.length === 0 && legacyContext

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">編輯代理</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                代理ID：
                <span className="font-semibold text-gray-900">{agent.playerId}</span>
              </p>
              <p className="text-sm text-gray-600 mb-2">
                代理名稱：
                <span className="font-semibold text-gray-900">{agent.playerName}</span>
              </p>
            </div>

            {showLegacyBanner && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 space-y-1.5">
                <p className="font-medium">請先完成俱樂部綁定設定</p>
                <p className="text-xs">
                  舊有單一上層代理與層級不再沿用，請手動重新設定。
                </p>
                {legacyContext.previousClub && (
                  <p className="text-xs">
                    原先所屬俱樂部：{legacyContext.previousClub.name}（
                    {legacyContext.previousClub.clubId}）
                  </p>
                )}
                <p className="text-xs">
                  會長：{formatPersonList(legacyContext.owners)}
                </p>
                <p className="text-xs">
                  副會長：{formatPersonList(legacyContext.coLeaders)}
                </p>
                {legacyContext.legacyUpstreamAgent && (
                  <p className="text-xs">
                    原先上層代理：{legacyContext.legacyUpstreamAgent.nickname}（
                    {legacyContext.legacyUpstreamAgent.userId}）
                  </p>
                )}
                <p className="text-xs">
                  原先代理層級：{legacyContext.legacyAgentLevelLabel}
                </p>
              </div>
            )}

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

            {agent.status === 'approved' && (
              <>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBinding(null)
                      setAddModalOpen(true)
                    }}
                    disabled={loading || bindingsLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    添加上層代理、房卡費
                  </button>
                </div>

                {bindingsLoading ? (
                  <p className="text-xs text-gray-500">載入綁定中…</p>
                ) : bindings.length > 0 ? (
                  <ul className="space-y-2">
                    {bindings.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700"
                      >
                        <p>
                          俱樂部：{b.clubName}（{b.clubId}）、代理房卡費：
                          {b.agentRoomCardFee}、代理層級：{b.agentLevelLabel}
                          、上層代理：
                          {b.upstreamAgent
                            ? `${b.upstreamAgent.nickname}（${b.upstreamAgent.userId}）`
                            : '無（總代理）'}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBinding(b)
                              setAddModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          >
                            <Pencil className="w-3 h-3" />
                            編輯
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteBinding(b)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-3 h-3" />
                            刪除
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">尚未設定俱樂部綁定</p>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    可創建俱樂部上限 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={maxClubCreateCount}
                    onChange={(e) => setMaxClubCreateCount(e.target.value)}
                    placeholder="1"
                    min="1"
                    step="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
                  />
                </div>
              </>
            )}
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

      <AddAgentClubBindingModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false)
          setEditingBinding(null)
        }}
        onSuccess={() => void loadBindings()}
        playerDbId={agent.playerDbId}
        editing={editingBinding}
        excludeClubDbIds={bindings.map((b) => b.clubDbId)}
      />
    </>
  )
}
