import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Settings as SettingsIcon, User, Bell, Shield, Database } from 'lucide-react'

// サイドバーのメニュー項目定義
const SETTINGS_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'general', label: '一般設定', icon: SettingsIcon, description: '基本設定' },
  { id: 'profile', label: 'プロフィール', icon: User, description: 'ユーザー情報' },
  { id: 'notifications', label: '通知設定', icon: Bell, description: '通知の設定' },
  { id: 'security', label: 'セキュリティ', icon: Shield, description: 'セキュリティ設定' },
  { id: 'data', label: 'データ管理', icon: Database, description: 'データのバックアップ' }
]
import { useSessionState } from '@/hooks/useSessionState'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { SettingsLayout } from '@/components/settings/SettingsLayout'

// 設定ページコンポーネント
import { StoreBasicSettings } from './pages/StoreBasicSettings'
import { BusinessHoursSettings } from './pages/BusinessHoursSettings'
import { PerformanceScheduleSettings } from './pages/PerformanceScheduleSettings'
import { ReservationSettings } from './pages/ReservationSettings'
import { CancellationSettings } from './pages/CancellationSettings'
import { PricingSettings } from './pages/PricingSettings'
import { SalesReportSettings } from './pages/SalesReportSettings'
import { NotificationSettings } from './pages/NotificationSettings'
import { StaffSettings } from './pages/StaffSettings'
import { SystemSettings } from './pages/SystemSettings'
import { EmailSettings } from './pages/EmailSettings'
import { CustomerSettings } from './pages/CustomerSettings'
import { DataManagementSettings } from './pages/DataManagementSettings'

export function Settings() {
  const [activeTab, setActiveTab] = useSessionState('settingsActiveTab', 'store-basic')
  const { selectedStoreId, handleStoreChange } = useSettingsStore()

  const renderContent = () => {
    // 全店舗選択時は店舗IDを空文字列に
    const storeId = selectedStoreId === 'all' ? '' : selectedStoreId
    
    switch (activeTab) {
      case 'store-basic':
        return <StoreBasicSettings storeId={storeId} />
      case 'business-hours':
        return <BusinessHoursSettings storeId={storeId} />
      case 'performance-schedule':
        return <PerformanceScheduleSettings storeId={storeId} />
      case 'reservation':
        return <ReservationSettings storeId={storeId} />
      case 'cancellation':
        return <CancellationSettings storeId={storeId} />
      case 'pricing':
        return <PricingSettings storeId={storeId} />
      case 'sales-report':
        return <SalesReportSettings storeId={storeId} />
      case 'notifications':
        return <NotificationSettings storeId={storeId} />
      case 'staff':
        return <StaffSettings storeId={storeId} />
      case 'system':
        return <SystemSettings storeId={storeId} />
      case 'email':
        return <EmailSettings storeId={storeId} />
      case 'customer':
        return <CustomerSettings storeId={storeId} />
      case 'data':
        return <DataManagementSettings storeId={storeId} />
      default:
        return <StoreBasicSettings storeId={storeId} />
    }
  }

  return (
    <AppLayout
      currentPage="settings"
      sidebar={
        <UnifiedSidebar
          title="設定"
          mode="list"
          menuItems={SETTINGS_MENU_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1600px]"
      containerPadding="px-8 py-6"
      stickyLayout={true}
    >
      <SettingsLayout 
        selectedStoreId={selectedStoreId}
        onStoreChange={handleStoreChange}
      >
        {renderContent()}
      </SettingsLayout>
    </AppLayout>
  )
}

export default Settings

