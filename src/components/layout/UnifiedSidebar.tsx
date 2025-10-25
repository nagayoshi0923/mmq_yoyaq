import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, LucideIcon } from 'lucide-react'

export interface SidebarMenuItem {
  id: string
  label: string
  icon: LucideIcon
  description?: string
}

interface UnifiedSidebarProps {
  /** サイドバーのタイトル */
  title: string
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
  mode = 'list',
  menuItems,
  activeTab,
  onTabChange,
  onBackToList,
  editModeSubtitle
}) => {
  return (
    <div className="w-72 bg-white flex-shrink-0 flex flex-col h-full">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-xl font-bold text-slate-800">
          {title}
        </h2>
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
            const Icon = item.icon
            const isActive = activeTab === item.id
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-md transition-all duration-200',
                  'group',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100'
                )}
              >
                <div className="w-full">
                  <div className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-blue-700' : 'text-slate-700 group-hover:text-slate-900'
                  )}>
                    {item.label}
                  </div>
                  {item.description && (
                    <div className={cn(
                      'text-xs mt-0.5',
                      isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-600'
                    )}>
                      {item.description}
                    </div>
                  )}
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
  )
}

