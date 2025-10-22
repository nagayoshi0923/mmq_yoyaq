import React, { ReactNode } from 'react'

interface SidebarLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  maxWidth?: string // 例: 'max-w-7xl', 'max-w-[1600px]'
  containerPadding?: string // 例: 'px-4 py-8', 'px-8 py-6'
}

/**
 * サイドバー付きレイアウトコンポーネント
 * 
 * 使用例:
 * <SidebarLayout 
 *   sidebar={<ScenarioSidebar activeTab={activeTab} onTabChange={setActiveTab} />}
 *   maxWidth="max-w-[1600px]"
 *   containerPadding="px-4 py-8"
 * >
 *   {メインコンテンツ}
 * </SidebarLayout>
 */
export const SidebarLayout: React.FC<SidebarLayoutProps> = ({ 
  sidebar, 
  children, 
  maxWidth = 'max-w-[1600px]',
  containerPadding = 'px-4 py-8'
}) => {
  return (
    <div className="flex">
      {/* サイドバー */}
      <div className="hidden lg:block">
        {sidebar}
      </div>
      
      {/* メインコンテンツ */}
      <div className={`flex-1 min-w-0 ${maxWidth}`}>
        <div className={containerPadding}>
          {children}
        </div>
      </div>
    </div>
  )
}

