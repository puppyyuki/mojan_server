'use client'

import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { apiPatch } from '@/lib/api-client'
import { requestAdminOpCode, withAdminOpCodeHeader } from '@/lib/admin-op-code-client'
import UpstreamAgentSelect from '@/app/admin/components/UpstreamAgentSelect'

interface Agent {
  id: string
  playerId: string
  playerDbId: string
  playerName: string
  roomCardBalance: number
  agentLevel?: 'normal' | 'master' | 'vip'
  maxClubCreateCount?: number
  status?: 'pending' | 'approved' | 'rejected'
  upstreamAgent: {
    playerDbId: string
    userId: string
    nickname: string
    agentLevel: string
    agentLevelLabel: string
  } | null
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
  const [agentLevel, setAgentLevel] = useState<'normal' | 'master' | 'vip'>('normal')
  const [maxClubCreateCount, setMaxClubCreateCount] = useState<string>('1')
  const [upstreamDbId, setUpstreamDbId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen && agent) {
      setCardCount(agent.roomCardBalance.toString())
      setAgentLevel(agent.agentLevel || 'normal')
      setMaxClubCreateCount(
        Math.max(Number(agent.maxClubCreateCount ?? 1) || 1, 1).toString()
      )
      setUpstreamDbId(agent.upstreamAgent?.playerDbId ?? null)
    }
  }, [isOpen, agent])

  const handleSave = async () => {
    if (loading || !agent) return

    const opCode = await requestAdminOpCode('確定要調整代理資料或房卡嗎？')
    if (!opCode) {
      return
    }

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

      const cardResponse = await apiPatch(`/api/players/${agent.playerDbId}`, {
        cardCount: parseInt(cardCount),
        upstreamAgentPlayerId: upstreamDbId,
      }, {
        headers: withAdminOpCodeHeader(opCode),
      })

      if (!cardResponse.ok) {
        const result = await cardResponse.json().catch(() => ({ error: '未知錯誤' }))
        const errorMessage = result.error || `補卡失敗 (HTTP ${cardResponse.status})`
        console.error('補卡失敗:', errorMessage, result)
        alert(errorMessage)
        setLoading(false)
        return
      }

      if (agent.status === 'approved') {
        const levelResponse = await apiPatch(`/api/admin/agents/${agent.id}/level`, {
          agentLevel: agentLevel,
          maxClubCreateCount: parsedMaxJoinClubCount,
        })

        if (!levelResponse.ok) {
          const result = await levelResponse.json().catch(() => ({ error: '未知錯誤' }))
          console.error('更新代理層級失敗:', result)
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-md mx-auto shadow-xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">編輯代理</h3>
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

          <UpstreamAgentSelect
            excludePlayerDbId={agent.playerDbId}
            valuePlayerDbId={upstreamDbId}
            onPick={(row) =>
              setUpstreamDbId(row ? row.playerDbId : null)
            }
            disabled={loading}
          />

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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  代理層級 <span className="text-red-500">*</span>
                </label>
                <select
                  value={agentLevel}
                  onChange={(e) => setAgentLevel(e.target.value as 'normal' | 'master' | 'vip')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white"
                >
                  <option value="normal">一般代理</option>
                  <option value="master">大代理</option>
                  <option value="vip">公關代理</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  房卡權限階層：公司 {'>'} 公關代理 {'>'} 大代理 {'>'} 一般代理 {'>'} 玩家；僅可向下轉卡且不可同階互轉
                </p>
              </div>
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
                <p className="mt-1 text-xs text-gray-500">
                  用於控制該代理最多可創建幾個俱樂部，預設為 1
                </p>
              </div>
            </>
          )}
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
