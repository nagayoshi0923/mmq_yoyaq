import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import SettingsSidebar from '@/components/layout/SettingsSidebar'
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
    switch (activeTab) {
      case 'store-basic':
        return <StoreBasicSettings storeId={selectedStoreId} />
      case 'business-hours':
        return <BusinessHoursSettings storeId={selectedStoreId} />
      case 'performance-schedule':
        return <PerformanceScheduleSettings storeId={selectedStoreId} />
      case 'reservation':
        return <ReservationSettings storeId={selectedStoreId} />
      case 'cancellation':
        return <CancellationSettings storeId={selectedStoreId} />
      case 'pricing':
        return <PricingSettings storeId={selectedStoreId} />
      case 'sales-report':
        return <SalesReportSettings storeId={selectedStoreId} />
      case 'notifications':
        return <NotificationSettings storeId={selectedStoreId} />
      case 'staff':
        return <StaffSettings storeId={selectedStoreId} />
      case 'system':
        return <SystemSettings storeId={selectedStoreId} />
      case 'email':
        return <EmailSettings storeId={selectedStoreId} />
      case 'customer':
        return <CustomerSettings storeId={selectedStoreId} />
      case 'data':
        return <DataManagementSettings storeId={selectedStoreId} />
      default:
        return <StoreBasicSettings storeId={selectedStoreId} />
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
            <SettingsLayout 
              selectedStoreId={selectedStoreId}
              onStoreChange={handleStoreChange}
            >
              {renderContent()}
            </SettingsLayout>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings

