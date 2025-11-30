import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { StaffManual } from './StaffManual'
import { ReservationManual } from './ReservationManual'
import { ShiftManual } from './ShiftManual'
import { 
  BookOpen, Users, CalendarDays, FileText, Menu 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const MENU_ITEMS = [
  { id: 'staff', label: 'スタッフ管理', icon: Users },
  { id: 'reservation', label: '予約管理', icon: CalendarDays },
  { id: 'schedule', label: 'シフト・スケジュール', icon: FileText },
]

export function ManualPage() {
  const [activeTab, setActiveTab] = useState('staff')
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  // URLパラメータから初期タブを設定
  useEffect(() => {
    const hash = window.location.hash
    const queryMatch = hash.match(/\?tab=([^&]+)/)
    if (queryMatch && queryMatch[1]) {
      const found = MENU_ITEMS.find(item => item.id === queryMatch[1])
      if (found) setActiveTab(found.id)
    }
  }, [])

  // タブ変更時にURLも更新
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setIsSheetOpen(false) // モバイルメニューを閉じる
    const currentHash = window.location.hash.split('?')[0]
    window.history.replaceState(null, '', `${currentHash}?tab=${value}`)
    window.scrollTo(0, 0)
  }

  const ActiveComponent = () => {
    switch (activeTab) {
      case 'staff': return <StaffManual />
      case 'reservation': return <ReservationManual />
      case 'schedule': return <ShiftManual />
      default: return <StaffManual />
    }
  }

  const activeLabel = MENU_ITEMS.find(item => item.id === activeTab)?.label

  return (
    <AppLayout 
      currentPage="manual"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      className="mx-auto"
    >
      <div className="space-y-6">
        <div className="flex flex-col space-y-4">
          {/* モバイル用ヘッダー（ハンバーガーメニュー） */}
          <div className="md:hidden flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 py-2 -mx-2 px-2 border-b">
            <div className="flex items-center gap-2 font-semibold">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <span>マニュアル</span>
              <span className="text-muted-foreground">/</span>
              <span>{activeLabel}</span>
            </div>
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="-mr-2">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">メニューを開く</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[350px]">
                <SheetHeader className="text-left mb-6">
                  <SheetTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    操作マニュアル
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-1">
                  {MENU_ITEMS.map((item) => (
                    <Button
                      key={item.id}
                      variant={activeTab === item.id ? "secondary" : "ghost"}
                      className="justify-start"
                      onClick={() => handleTabChange(item.id)}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Button>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* PC用ヘッダー */}
          <div className="hidden md:block">
            <PageHeader
              title="操作マニュアル"
              description="システムの操作方法と使用シーンについてのガイド"
            >
              <BookOpen className="h-5 w-5 text-muted-foreground" />
            </PageHeader>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* PC用サイドバーメニュー */}
          <aside className="hidden md:block w-64 shrink-0 space-y-4">
            <nav className="flex flex-col space-y-1 sticky top-24">
              {MENU_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "secondary" : "ghost"}
                  className={cn(
                    "justify-start",
                    activeTab === item.id && "bg-secondary/50"
                  )}
                  onClick={() => handleTabChange(item.id)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </nav>
          </aside>

          {/* メインコンテンツ */}
          <main className="flex-1 min-w-0">
            <ActiveComponent />
          </main>
        </div>
      </div>
    </AppLayout>
  )
}
