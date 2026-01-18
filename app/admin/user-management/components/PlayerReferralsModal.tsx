import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { apiGet } from '@/lib/api-client'

interface PlayerReferralsModalProps {
  isOpen: boolean
  onClose: () => void
  playerId: string
  playerName: string
}

export default function PlayerReferralsModal({
  isOpen,
  onClose,
  playerId,
  playerName
}: PlayerReferralsModalProps) {
  const [loading, setLoading] = useState(false)
  const [referrals, setReferrals] = useState<any[]>([])
  const [referralStats, setReferralStats] = useState<any>(null)

  useEffect(() => {
    if (isOpen && playerId) {
      fetchReferrals()
    }
  }, [isOpen, playerId])

  const fetchReferrals = async () => {
    setLoading(true)
    try {
      const response = await apiGet(`/api/client/referral/info?playerId=${playerId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
            setReferrals(result.data.referredPlayers || [])
            setReferralStats(result.data)
        }
      }
    } catch (error) {
      console.error('Fetch referrals failed', error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col text-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {playerName} 的推廣紀錄
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
           {loading ? (
             <div className="text-center py-10 text-gray-500">Loading...</div>
           ) : (
             <div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded">
                        <div className="text-gray-500 text-sm">已推廣人數</div>
                        <div className="text-2xl font-bold text-blue-600">{referralStats?.referralCount || 0}</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded">
                        <div className="text-gray-500 text-sm">獲得獎勵 (房卡)</div>
                        <div className="text-2xl font-bold text-green-600">{referralStats?.totalRewards || 0}</div>
                    </div>
                </div>

                <table className="w-full">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-gray-500 font-medium">玩家暱稱</th>
                            <th className="px-4 py-2 text-left text-gray-500 font-medium">ID</th>
                            <th className="px-4 py-2 text-left text-gray-500 font-medium">綁定時間</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {referrals.length === 0 ? (
                            <tr><td colSpan={3} className="text-center py-4 text-gray-500">尚無推廣紀錄</td></tr>
                        ) : (
                            referrals.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 text-gray-900">{p.nickname}</td>
                                    <td className="px-4 py-2 text-gray-900">{p.userId}</td>
                                    <td className="px-4 py-2 text-gray-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
             </div>
           )}
        </div>
      </div>
    </div>
  )
}
