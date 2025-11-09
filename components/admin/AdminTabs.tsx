'use client'

import { X } from 'lucide-react'

export interface Tab {
  id: string
  label: string
  path: string
  closable: boolean
}

interface AdminTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
}

export default function AdminTabs({ tabs, activeTab, onTabClick, onTabClose }: AdminTabsProps) {
  return (
    <div className="bg-white border-b border-gray-200 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-2 px-4 py-3 border-r border-gray-200 cursor-pointer whitespace-nowrap transition-colors ${
            activeTab === tab.id
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-500'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
          onClick={() => onTabClick(tab.id)}
        >
          <span className="text-sm font-medium">{tab.label}</span>
          {tab.closable && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
              className="p-1 rounded hover:bg-gray-200 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

