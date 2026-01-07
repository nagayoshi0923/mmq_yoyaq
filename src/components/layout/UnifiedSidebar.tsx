import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, LucideIcon, Menu, X } from 'lucide-react'

export interface SidebarMenuItem {
  id: string
  label: string
  icon: LucideIcon
  description?: string
}

interface UnifiedSidebarProps {
  /** サイドバーのタイトル */
  title: string
  /** タイトル下の説明文 */
  description?: string
  /** 現在のモード（list: 一覧表示、edit: 編集モード） */
  mode?: 'list' | 'edit'
  /** 表示するメニュー項目 */
  menuItems: SidebarMenuItem[]
  /** アクティブなタブID */
  activeTab: string
  /** タブ変更時のコールバック */
  onTabChange: (tab: string) => void
  /** 一覧に戻るボタンのコールバック（editモード時のみ表示） */
  onBackToList?: () => void
  /** 編集モード時のサブタイトル（例: スタッフ名、シナリオ名） */
  editModeSubtitle?: string
}

export const UnifiedSidebar: React.FC<UnifiedSidebarProps> = ({
  title,
  description,
  mode = 'list',
  menuItems,
  activeTab,
  onTabChange,
  onBackToList,
  editModeSubtitle
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleMenuItemClick = (itemId: string) => {
    onTabChange(itemId)
    setIsMobileMenuOpen(false) // モバイルメニューを閉じる
  }

  return (
    <>
      {/* ハンバーガーメニューボタン（モバイルのみ） */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 p-3 bg-primary text-white hover:bg-primary/90 transition-all hover:scale-110"
        aria-label="メニューを開く"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* オーバーレイ（モバイルメニュー開いている時） */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* デスクトップ版サイドバー（lg以上） */}
      <div className="hidden md:flex w-72 bg-white flex-shrink-0 flex-col h-full">
        {/* ヘッダー */}
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
          {mode === 'edit' && editModeSubtitle && (
            <p className="text-sm text-slate-500 mt-1">{editModeSubtitle}</p>
          )}
        </div>

        {/* 一覧に戻るボタン（editモード時のみ） */}
        {mode === 'edit' && onBackToList && (
          <div className="p-4 border-b border-slate-200">
            <Button
              variant="outline"
              onClick={onBackToList}
              className="w-full justify-start gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              一覧に戻る
            </Button>
          </div>
        )}

        {/* メニュー項目 */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const isActive = activeTab === item.id
              const Icon = item.icon
              
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'w-full text-left px-4 py-2 transition-all duration-200',
                    'flex items-center gap-3',
                    'group',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <Icon className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-blue-700' : 'text-slate-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-xs font-medium',
                      isActive ? 'text-blue-700' : 'text-slate-700 group-hover:text-slate-900'
                    )}>
                      {item.label}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>

        {/* フッター（オプション） */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 text-center">
            {mode === 'list' ? '項目を選択して編集' : '変更を保存してください'}
          </div>
        </div>
      </div>

      {/* モバイル版サイドバー（スライドインメニュー） */}
      <div
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 flex flex-col',
          'border-r border-slate-200 shadow-xl',
          'transition-transform duration-300 ease-in-out',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* ヘッダー */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">
              {title}
            </h2>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1 hover:bg-slate-100"
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5 text-slate-700" />
            </button>
          </div>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
        </div>

        {/* 一覧に戻るボタン（editモード時のみ） */}
        {mode === 'edit' && onBackToList && (
          <div className="p-4 border-b border-slate-200">
            <Button
              variant="outline"
              onClick={() => {
                onBackToList()
                setIsMobileMenuOpen(false)
              }}
              className="w-full justify-start gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              一覧に戻る
            </Button>
          </div>
        )}

        {/* メニュー項目 */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const isActive = activeTab === item.id
              const Icon = item.icon
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleMenuItemClick(item.id)}
                  className={cn(
                    'w-full text-left px-4 py-2 transition-all duration-200',
                    'flex items-center gap-3',
                    'group',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <Icon className={cn(
                    'h-4 w-4 flex-shrink-0',
                    isActive ? 'text-blue-700' : 'text-slate-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-xs font-medium',
                      isActive ? 'text-blue-700' : 'text-slate-700 group-hover:text-slate-900'
                    )}>
                      {item.label}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>

        {/* フッター */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="text-xs text-slate-500 text-center">
            {mode === 'list' ? '項目を選択して編集' : '変更を保存してください'}
          </div>
        </div>
      </div>
    </>
  )
}

