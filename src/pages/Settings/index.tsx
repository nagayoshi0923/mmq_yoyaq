import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import SettingsSidebar from '@/components/layout/SettingsSidebar'
import { useSessionState } from '@/hooks/useSessionState'

// 設定ページコンポーネント
import { StoreBasicSettings } from './pages/StoreBasicSettings'
import { BusinessHoursSettings } from './pages/BusinessHoursSettings'
import { PerformanceScheduleSettings } from './pages/PerformanceScheduleSettings'
import { ReservationSettings } from './pages/ReservationSettings'
import { PricingSettings } from './pages/PricingSettings'
import { SalesReportSettings } from './pages/SalesReportSettings'
import { NotificationSettings } from './pages/NotificationSettings'

export function Settings() {
  const [activeTab, setActiveTab] = useSessionState('settingsActiveTab', 'store-basic')

  const renderContent = () => {
    switch (activeTab) {
      case 'store-basic':
        return <StoreBasicSettings />
      case 'business-hours':
        return <BusinessHoursSettings />
      case 'performance-schedule':
        return <PerformanceScheduleSettings />
      case 'reservation':
        return <ReservationSettings />
      case 'pricing':
        return <PricingSettings />
      case 'sales-report':
        return <SalesReportSettings />
      case 'notifications':
        return <NotificationSettings />
      case 'staff':
        return <div className="text-center py-12 text-muted-foreground">スタッフ設定（準備中）</div>
      case 'system':
        return <div className="text-center py-12 text-muted-foreground">システム設定（準備中）</div>
      case 'email':
        return <div className="text-center py-12 text-muted-foreground">メール設定（準備中）</div>
      case 'customer':
        return <div className="text-center py-12 text-muted-foreground">顧客管理設定（準備中）</div>
      case 'data':
        return <div className="text-center py-12 text-muted-foreground">データ管理設定（準備中）</div>
      default:
        return <StoreBasicSettings />
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="settings" />
      
      <div className="flex">
        {/* サイドバー */}
        <div className="hidden lg:block">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
        
        {/* メインコンテンツ */}
        <div className="flex-1 min-w-0">
          <div className="container mx-auto max-w-7xl px-8 py-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings

