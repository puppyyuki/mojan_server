'use client'

import { 
  LayoutDashboard,
  Users,
  Building2,
  UserCircle,
  Wallet,
  FileText,
  CreditCard,
  Terminal,
  BarChart,
  Megaphone,
  PieChart,
  Bell
} from 'lucide-react'

interface MenuItem {
  id: string
  label: string
  icon: any
  path?: string
  children?: MenuItem[]
}

interface AdminNavigationProps {
  onMenuClick: (path: string, label: string) => void
  activeMenu?: string
}

export default function AdminNavigation({ onMenuClick, activeMenu }: AdminNavigationProps) {
  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: '首頁',
      icon: LayoutDashboard,
      path: '/admin'
    },
    {
      id: 'agent-management',
      label: '代理管理',
      icon: Users,
      path: '/admin/agent-management'
    },
    {
      id: 'club-management',
      label: '俱樂部管理',
      icon: Building2,
      path: '/admin/club-management'
    },
    {
      id: 'user-management',
      label: '玩家管理',
      icon: UserCircle,
      path: '/admin/user-management'
    },
    {
      id: 'payment-management',
      label: '金流管理',
      icon: Wallet,
      path: '/admin/payment-management'
    },
    {
      id: 'game-record-management',
      label: '遊戲紀錄管理',
      icon: FileText,
      path: '/admin/game-record-management'
    },
    {
      id: 'card-replenishment',
      label: '補卡',
      icon: CreditCard,
      path: '/admin/card-replenishment'
    },
    {
      id: 'command',
      label: '指令',
      icon: Terminal,
      path: '/admin/command'
    },
    {
      id: 'report',
      label: '報表',
      icon: BarChart,
      path: '/admin/report'
    },
    {
      id: 'promotion',
      label: '推廣',
      icon: Megaphone,
      path: '/admin/promotion'
    },
    {
      id: 'statistics',
      label: '統計圖表',
      icon: PieChart,
      path: '/admin/statistics'
    },
    {
      id: 'announcement-management',
      label: '活動更新',
      icon: Bell,
      path: '/admin/announcement-management'
    }
  ]

  const handleMenuClick = (item: MenuItem) => {
    if (item.path) {
      onMenuClick(item.path, item.label)
    }
  }

  const isActive = (path?: string) => path === activeMenu

  return (
    <div className="w-56 bg-[#2c3e50] text-white h-screen overflow-y-auto flex flex-col">
      {/* Logo 區域 */}
      <div className="px-6 py-4 bg-[#34495e] border-b border-[#2c3e50]">
        <div className="flex items-center gap-2">
          <span 
            className="text-xl font-bold text-blue-500"
            style={{
              textShadow: '0 0 3px white, 0 0 3px white, 0 0 3px white, 0 0 4px white'
            }}
          >
            伍參麻將
          </span>
          <span className="text-white text-base">管理後台</span>
        </div>
      </div>

      {/* 導覽選單 */}
      <nav className="flex-1 py-2">
        {menuItems.map((item) => (
          <div key={item.id}>
            {/* 主選單項目 */}
            <button
              onClick={() => handleMenuClick(item)}
              className={`w-full flex items-center gap-3 px-6 py-4 hover:bg-[#34495e] transition-colors ${
                isActive(item.path) ? 'text-blue-400 border-r-4 border-blue-500' : ''
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          </div>
        ))}
      </nav>

      {/* 底部資訊 */}
      <div className="p-4 bg-[#1e2d3d] border-t border-[#2c3e50]">
        <div className="text-xs text-gray-400 text-center">
          <p>© 2025 伍參麻將</p>
          <p className="mt-1">v1.0.0</p>
        </div>
      </div>
    </div>
  )
}

