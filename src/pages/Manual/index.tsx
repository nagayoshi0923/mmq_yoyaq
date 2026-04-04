import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { StaffManual } from './StaffManual'
import { ReservationManual } from './ReservationManual'
import { ShiftManual } from './ShiftManual'
import { CouponManual } from './CouponManual'
import { CouponReceptionManual } from './CouponReceptionManual'
import { CheckinManual } from './CheckinManual'
import { cn } from '@/lib/utils'
import {
  BookOpen, Users, CalendarDays, FileText, Ticket, Scissors,
  ClipboardCheck, ChevronDown, ChevronRight, Menu, X,
} from 'lucide-react'

// スタッフ向けメニュー
const STAFF_ITEMS = [
  { id: 'checkin', label: '受付・チェックイン', icon: ClipboardCheck },
  { id: 'coupon-reception', label: 'クーポン受付対応', icon: Scissors },
]

// 運営向けメニュー（折りたたみ）
const ADMIN_ITEMS = [
  { id: 'reservation', label: '予約管理', icon: CalendarDays },
  { id: 'staff', label: 'スタッフ管理', icon: Users },
  { id: 'schedule', label: 'シフト・スケジュール', icon: FileText },
  { id: 'coupon', label: 'クーポン管理', icon: Ticket },
]

const ALL_IDS = [...STAFF_ITEMS, ...ADMIN_ITEMS].map(i => i.id)

interface ManualSidebarProps {
  activeTab: string
  onTabChange: (id: string) => void
  onClose?: () => void
}

function ManualSidebarContent({ activeTab, onTabChange, onClose }: ManualSidebarProps) {
  const isAdminActive = ADMIN_ITEMS.some(i => i.id === activeTab)
  const [adminOpen, setAdminOpen] = useState(isAdminActive)

  const handleClick = (id: string) => {
    onTabChange(id)
    onClose?.()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">操作マニュアル</h2>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-slate-100 md:hidden">
            <X className="h-5 w-5 text-slate-700" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* スタッフ向け */}
        {STAFF_ITEMS.map(item => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={cn(
                'w-full text-left px-4 py-2 flex items-center gap-3 transition-all duration-200',
                isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-blue-700' : 'text-slate-500')} />
              <span className={cn('text-xs font-medium', isActive ? 'text-blue-700' : '')}>{item.label}</span>
            </button>
          )
        })}

        {/* 運営セクション（折りたたみ） */}
        <div className="pt-2">
          <button
            onClick={() => setAdminOpen(o => !o)}
            className="w-full text-left px-4 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wide hover:text-slate-600 transition-colors"
          >
            <span>運営</span>
            {adminOpen
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>

          {adminOpen && (
            <div className="space-y-1 mt-1">
              {ADMIN_ITEMS.map(item => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      'w-full text-left pl-6 pr-4 py-2 flex items-center gap-3 transition-all duration-200',
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-blue-700' : 'text-slate-500')} />
                    <span className={cn('text-xs font-medium', isActive ? 'text-blue-700' : '')}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200 bg-slate-50">
        <div className="text-xs text-slate-500 text-center">項目を選択して閲覧</div>
      </div>
    </div>
  )
}

function ManualSidebar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (id: string) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* モバイル ハンバーガーボタン */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 p-3 bg-primary text-white hover:bg-primary/90 transition-all hover:scale-110"
        aria-label="メニューを開く"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* モバイル オーバーレイ */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* デスクトップ */}
      <div className="hidden md:flex w-72 bg-white flex-shrink-0 flex-col h-full">
        <ManualSidebarContent activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      {/* モバイル スライドイン */}
      <div
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 flex flex-col',
          'border-r border-slate-200 shadow-xl transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <ManualSidebarContent activeTab={activeTab} onTabChange={onTabChange} onClose={() => setMobileOpen(false)} />
      </div>
    </>
  )
}

export function ManualPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const defaultTab = STAFF_ITEMS[0]?.id ?? ADMIN_ITEMS[0]?.id ?? ''
  const validTab = ALL_IDS.includes(tabParam ?? '') ? (tabParam ?? defaultTab) : defaultTab
  const [activeTab, setActiveTab] = useState(validTab)

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setSearchParams({ tab: value }, { replace: true })
    window.scrollTo(0, 0)
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'staff': return <StaffManual />
      case 'reservation': return <ReservationManual />
      case 'schedule': return <ShiftManual />
      case 'checkin': return <CheckinManual />
      case 'coupon-reception': return <CouponReceptionManual />
      case 'coupon': return <CouponManual />
      default: return <ReservationManual />
    }
  }

  return (
    <AppLayout
      currentPage="manual"
      sidebar={<ManualSidebar activeTab={activeTab} onTabChange={handleTabChange} />}
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
        {renderContent()}
      </div>
    </AppLayout>
  )
}
