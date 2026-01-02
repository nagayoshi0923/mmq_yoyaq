import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { PageHeader } from '@/components/layout/PageHeader'
import { StaffManual } from './StaffManual'
import { ReservationManual } from './ReservationManual'
import { ShiftManual } from './ShiftManual'
import { 
  BookOpen, Users, CalendarDays, FileText
} from 'lucide-react'

// サイドバーのメニュー項目定義
const MANUAL_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'staff', label: 'スタッフ管理', icon: Users, description: 'スタッフの登録・編集' },
  { id: 'reservation', label: '予約管理', icon: CalendarDays, description: '予約の確認・操作' },
  { id: 'schedule', label: 'シフト・スケジュール', icon: FileText, description: 'シフトと公演管理' },
]

export function ManualPage() {
  const [activeTab, setActiveTab] = useState('staff')

  // URLパラメータから初期タブを設定
  useEffect(() => {
    const hash = window.location.hash
    const queryMatch = hash.match(/\?tab=([^&]+)/)
    if (queryMatch && queryMatch[1]) {
      const found = MANUAL_MENU_ITEMS.find(item => item.id === queryMatch[1])
      if (found) setActiveTab(found.id)
    }
  }, [])

  // タブ変更時にURLも更新
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const currentHash = window.location.hash.split('?')[0]
    window.history.replaceState(null, '', `${currentHash}?tab=${value}`)
    window.scrollTo(0, 0)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'staff': return <StaffManual />
      case 'reservation': return <ReservationManual />
      case 'schedule': return <ShiftManual />
      default: return <StaffManual />
    }
  }

  return (
    <AppLayout 
      currentPage="manual"
      sidebar={
        <UnifiedSidebar
          title="操作マニュアル"
          mode="list"
          menuItems={MANUAL_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      }
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">操作マニュアル</span>
            </div>
          }
              description="システムの操作方法と使用シーンについてのガイド"
        />

          {/* メインコンテンツ */}
        {renderContent()}
      </div>
    </AppLayout>
  )
}
