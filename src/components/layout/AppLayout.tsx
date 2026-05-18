import React, { ReactNode } from 'react'
import { Header } from './Header'
import { AdminSidebar } from './AdminSidebar'

interface AppLayoutProps {
  currentPage: string
  sidebar?: ReactNode
  children: ReactNode
  maxWidth?: string
  containerPadding?: string
  stickyLayout?: boolean // ヘッダー・ナビ・サイドバーを固定するか
  className?: string // 追加のクラス名
}

/**
 * アプリケーション全体のレイアウトコンポーネント
 * 
 * 使用例（固定レイアウト）:
 * <AppLayout 
 *   currentPage="scenarios"
 *   sidebar={<ScenarioSidebar activeTab={activeTab} onTabChange={setActiveTab} />}
 *   stickyLayout={true}
 * >
 *   {メインコンテンツ}
 * </AppLayout>
 */
export const AppLayout: React.FC<AppLayoutProps> = ({
  currentPage,
  sidebar,
  children,
  maxWidth,          // 非推奨・後方互換用。基本は使わない
  containerPadding = 'px-[10px] py-3 sm:py-4 md:py-6',
  stickyLayout = false,
  className = ''
}) => {
  if (stickyLayout) {
    return (
      // w-screen + overflow-hidden でページ横スクロールを完全に封じる
      <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
        <Header />
        <div className="flex flex-1 min-h-0 min-w-0">
          <AdminSidebar />
          <div className={`flex-1 flex min-h-0 min-w-0 ${className}`}>
            {sidebar && (
              <div className="border-r border-slate-200 shrink-0">
                {sidebar}
              </div>
            )}
            <div data-scroll-container className="flex-1 min-w-0 overflow-y-auto overflow-x-auto">
              <div data-scroll-content className={`${containerPadding} min-w-0`}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0 min-w-0">
        <AdminSidebar />
        <div className={`flex flex-1 min-h-0 min-w-0 ${className}`}>
          {sidebar && (
            <div className="border-r border-slate-200 shrink-0">
              {sidebar}
            </div>
          )}
          <div data-scroll-container className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div className={`${containerPadding} min-w-0`}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

