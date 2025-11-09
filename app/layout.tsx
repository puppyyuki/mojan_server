import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '伍參麻將管理後台',
  description: '伍參麻將管理後台系統',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}

