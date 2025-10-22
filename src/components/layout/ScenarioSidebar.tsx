import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  BookOpen,
  FileText,
  DollarSign,
  Users,
  Package,
  Calendar,
  ArrowLeft
} from 'lucide-react'

interface ScenarioSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onBackToList?: () => void
  mode?: 'list' | 'edit'
}

const ScenarioSidebar: React.FC<ScenarioSidebarProps> = ({ activeTab, onTabChange, onBackToList, mode = 'edit' }) => {
  const scenarioListMenuItems = [
    {
      id: 'scenario-list',
      label: 'シナリオ一覧',
      icon: BookOpen,
      description: 'すべてのシナリオを表示'
    },
    {
      id: 'new-scenario',
      label: '新規作成',
      icon: FileText,
      description: '新しいシナリオを作成'
    },
    {
      id: 'search-filter',
      label: '検索・フィルタ',
      icon: DollarSign,
      description: 'シナリオを検索・フィルタ'
    },
    {
      id: 'import-export',
      label: 'インポート・エクスポート',
      icon: Users,
      description: 'シナリオの一括操作'
    }
  ]

  const scenarioEditMenuItems = [
    {
      id: 'basic',
      label: '基本情報',
      icon: BookOpen,
      description: 'タイトル、作者、説明文'
    },
    {
      id: 'game-info',
      label: 'ゲーム情報',
      icon: FileText,
      description: 'プレイ時間、人数、難易度'
    },
    {
      id: 'pricing',
      label: '料金設定',
      icon: DollarSign,
      description: '参加費、ライセンス料'
    },
    {
      id: 'gm-settings',
      label: 'GM・スタッフ設定',
      icon: Users,
      description: 'GM数、報酬、担当GM設定'
    },
    {
      id: 'costs-props',
      label: '制作費・小道具',
      icon: Package,
      description: '制作費、必要小道具'
    },
    {
      id: 'performance-schedule',
      label: '公演予定',
      icon: Calendar,
      description: 'このシナリオの公演スケジュール'
    }
  ]

  const menuItems = mode === 'list' ? scenarioListMenuItems : scenarioEditMenuItems

  return (
    <div className="w-72 bg-slate-50 border-r border-slate-200 h-full flex-shrink-0">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-800">
              {mode === 'list' ? 'シナリオ管理' : 'シナリオ編集'}
            </h2>
          </div>
          {onBackToList && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToList}
              className="h-8 w-8 p-0"
              title="シナリオ一覧に戻る"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeTab === item.id ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start h-auto p-3",
                  activeTab === item.id 
                    ? "bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200" 
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                )}
                onClick={() => onTabChange(item.id)}
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {item.description}
                    </div>
                  </div>
                </div>
              </Button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default ScenarioSidebar
