'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import AdminNavigation from '@/components/admin/AdminNavigation'
import AdminTabs, { Tab } from '@/components/admin/AdminTabs'
import { LogOut } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTab, setActiveTab] = useState('home')
  const [tabsInitialized, setTabsInitialized] = useState(false)

  // 載入保存的頁籤
  useEffect(() => {
    const savedTabs = localStorage.getItem('adminTabs')
    const savedActiveTab = localStorage.getItem('adminActiveTab')
    
    if (savedTabs) {
      try {
        const parsedTabs = JSON.parse(savedTabs)
        setTabs(parsedTabs)
        if (savedActiveTab) {
          setActiveTab(savedActiveTab)
        }
      } catch (error) {
        console.error('載入頁籤失敗:', error)
        // 如果載入失敗，使用預設頁籤
        setTabs([{ id: 'home', label: '首頁', path: '/admin', closable: false }])
      }
    } else {
      // 如果沒有保存的頁籤，使用預設頁籤
      setTabs([{ id: 'home', label: '首頁', path: '/admin', closable: false }])
    }
    setTabsInitialized(true)
  }, [])

  // 保存頁籤到 localStorage
  useEffect(() => {
    if (tabsInitialized && tabs.length > 0) {
      localStorage.setItem('adminTabs', JSON.stringify(tabs))
    }
  }, [tabs, tabsInitialized])

  // 保存活動頁籤到 localStorage
  useEffect(() => {
    if (tabsInitialized && activeTab) {
      localStorage.setItem('adminActiveTab', activeTab)
    }
  }, [activeTab, tabsInitialized])

  useEffect(() => {
    // 檢查是否已登入
    const adminToken = localStorage.getItem('adminToken')
    if (!adminToken && pathname !== '/admin/login') {
      router.push('/admin/login')
    } else if (adminToken) {
      setIsAuthenticated(true)
    }
  }, [router, pathname])

  // 根據當前路徑設定活動頁籤
  useEffect(() => {
    if (tabsInitialized && pathname && pathname !== '/admin/login') {
      const currentTab = tabs.find(tab => tab.path === pathname)
      if (currentTab) {
        setActiveTab(currentTab.id)
      } else if (pathname === '/admin') {
        setActiveTab('home')
      }
    }
  }, [pathname, tabs, tabsInitialized])

  const handleMenuClick = (path: string, label: string) => {
    const tabId = path.replace('/admin/', '') || 'home'
    
    // 檢查是否已存在該頁籤
    const existingTab = tabs.find(tab => tab.path === path)
    
    if (existingTab) {
      // 如果已存在，切換到該頁籤
      setActiveTab(existingTab.id)
      router.push(path)
    } else {
      // 如果不存在，新增頁籤
      const newTab: Tab = {
        id: tabId,
        label,
        path,
        closable: true
      }
      setTabs(prev => [...prev, newTab])
      setActiveTab(tabId)
      router.push(path)
    }
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId)
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      router.push(tab.path)
    }
  }

  const handleTabClose = (tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId)
    const newTabs = tabs.filter(t => t.id !== tabId)
    setTabs(newTabs)

    // 如果關閉的是當前頁籤，切換到前一個頁籤
    if (activeTab === tabId) {
      const newActiveTab = newTabs[Math.max(0, tabIndex - 1)]
      setActiveTab(newActiveTab.id)
      router.push(newActiveTab.path)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    localStorage.removeItem('adminTabs')
    localStorage.removeItem('adminActiveTab')
    router.push('/admin/login')
  }

  // 登入頁面不顯示佈局
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* 左側導覽 */}
      <AdminNavigation onMenuClick={handleMenuClick} activeMenu={tabs.find(t => t.id === activeTab)?.path} />

      {/* 右側內容區域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 頂部標題列 */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {tabs.find(t => t.id === activeTab)?.label || '首頁'}
            </h1>
            <p className="text-sm text-gray-500">管理和監控系統數據</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            登出
          </button>
        </div>

        {/* 頁籤列 */}
        {tabs.length > 0 && (
          <AdminTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
          />
        )}

        {/* 內容區域 */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

