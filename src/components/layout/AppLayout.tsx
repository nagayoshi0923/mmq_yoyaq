import React, { ReactNode } from 'react'
import { Header } from './Header'
import { NavigationBar } from './NavigationBar'

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
  maxWidth = 'max-w-[1440px]',
  containerPadding = 'px-[10px] py-3 sm:py-4 md:py-6',
  stickyLayout = false,
  className = ''
}) => {
  if (stickyLayout) {
    // 固定レイアウト: ヘッダー・ナビ・サイドバーを固定、コンテンツのみスクロール
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* ヘッダー（固定） */}
        <Header />
        
        {/* ナビゲーションバー（固定） */}
        <NavigationBar currentPage={currentPage} />
        
        {/* メインエリア（サイドバー含めてmax-width適用） */}
        <div className={`flex-1 flex min-h-0 ${maxWidth} ${className} mx-auto w-full`}>
          {/* サイドバー */}
          {sidebar && (
            <div className="border-r border-slate-200 shrink-0">
              {sidebar}
            </div>
          )}
          
          {/* メインコンテンツ（スクロール可能） */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
            <div className={containerPadding}>
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 通常レイアウト: ページ全体がスクロール
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage={currentPage} />
      
      {/* サイドバー含めてmax-width適用 */}
      <div className={`flex ${maxWidth} ${className} mx-auto w-full`}>
        {/* サイドバー */}
        {sidebar && (
          <div className="border-r border-slate-200 shrink-0">
            {sidebar}
          </div>
        )}
        
        {/* メインコンテンツ */}
        <div className="flex-1 min-w-0">
          <div className={containerPadding}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

