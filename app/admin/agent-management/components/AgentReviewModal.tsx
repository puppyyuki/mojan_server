'use client'

import { X, CheckCircle, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiPost } from '@/lib/api-client'
import UpstreamAgentSelect from '@/app/admin/components/UpstreamAgentSelect'

interface AgentReviewModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  agent: {
    id: string
    playerDbId: string
    playerId: string
    playerName: string
    fullName: string
    phone: string
    note: string | null
    status: string
  } | null
}

export default function AgentReviewModal({
  isOpen,
  onClose,
  onSuccess,
  agent,
}: AgentReviewModalProps) {
  const [approveUpstreamOpen, setApproveUpstreamOpen] = useState(false)
  const [chosenUpstreamDbId, setChosenUpstreamDbId] = useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)

  useEffect(() => {
    if (!approveUpstreamOpen) {
      setChosenUpstreamDbId(null)
    }
  }, [approveUpstreamOpen])

  if (!isOpen || !agent) return null

  const playerDbIdForExclude = agent.playerDbId

  const handleOpenApproveUpstream = () => {
    setChosenUpstreamDbId(null)
    setApproveUpstreamOpen(true)
  }

  const handleConfirmApproveWithUpstream = async () => {
    if (submitLoading) return
    setSubmitLoading(true)
    try {
      const response = await apiPost(`/api/admin/agents/${agent.id}/approve`, {
        upstreamAgentPlayerId:
          chosenUpstreamDbId === null ? null : chosenUpstreamDbId,
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          alert('批准成功')
          setApproveUpstreamOpen(false)
          onSuccess()
          onClose()
        } else {
          alert(result.error || '批准失敗')
        }
      } else {
        const result = await response.json()
        alert(result.error || '批准失敗')
      }
    } catch (error) {
      console.error('批准代理申請失敗:', error)
      alert('批准失敗')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleReject = async () => {
    if (!confirm('確定要拒絕此代理申請嗎？')) {
      return
    }

    try {
      const response = await apiPost(`/api/admin/agents/${agent.id}/reject`, {})
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          alert('拒絕成功')
          onSuccess()
          onClose()
        } else {
          alert(result.error || '拒絕失敗')
        }
      } else {
        const result = await response.json()
        alert(result.error || '拒絕失敗')
      }
    } catch (error) {
      console.error('拒絕代理申請失敗:', error)
      alert('拒絕失敗')
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={() => {
          if (!approveUpstreamOpen) onClose()
        }}
      >
        <div
          className="bg-white rounded-lg w-full max-w-2xl mx-auto shadow-xl relative flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 標題 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">審核代理申請</h3>
            <button
              onClick={() => {
                setApproveUpstreamOpen(false)
                onClose()
              }}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors duration-200"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* 內容 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  玩家ID
                </label>
                <div className="text-sm text-gray-900">{agent.playerId}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  玩家名稱
                </label>
                <div className="text-sm text-gray-900">{agent.playerName}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  姓名
                </label>
                <div className="text-sm text-gray-900">{agent.fullName}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  手機號碼
                </label>
                <div className="text-sm text-gray-900">{agent.phone}</div>
              </div>
              {agent.note && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    備註
                  </label>
                  <div className="text-sm text-gray-900">{agent.note}</div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  狀態
                </label>
                <div className="text-sm">
                  {agent.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      待審核
                    </span>
                  )}
                  {agent.status === 'approved' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      已批准
                    </span>
                  )}
                  {agent.status === 'rejected' && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      已拒絕
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 底部 */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => {
                setApproveUpstreamOpen(false)
                onClose()
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
            {agent.status === 'pending' && (
              <>
                <button
                  onClick={handleReject}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  拒絕
                </button>
                <button
                  onClick={handleOpenApproveUpstream}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  批准
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {approveUpstreamOpen && agent.status === 'pending' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl p-6 relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h4 className="text-base font-semibold text-gray-900">
                指定上層代理（選填）
              </h4>
              <button
                type="button"
                aria-label="關閉"
                className="p-1 hover:bg-gray-100 rounded-full"
                onClick={() => setApproveUpstreamOpen(false)}
              >
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              請選擇此次核准對象的<strong>上層代理</strong>（可留白表示無）。
              完成後將正式核准申請。
            </p>

            <UpstreamAgentSelect
              excludePlayerDbId={playerDbIdForExclude}
              valuePlayerDbId={chosenUpstreamDbId}
              onPick={(row) =>
                setChosenUpstreamDbId(row ? row.playerDbId : null)
              }
              disabled={submitLoading}
            />

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                disabled={submitLoading}
                onClick={() => setApproveUpstreamOpen(false)}
              >
                返回
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={submitLoading}
                onClick={handleConfirmApproveWithUpstream}
              >
                {submitLoading ? '處理中…' : '確認核准'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
