import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { 
  Settings as SettingsIcon, 
  Building2, 
  Clock, 
  Calendar, 
  Users, 
  Mail, 
  Bell, 
  Database,
  DollarSign,
  FileText,
  UserCog,
  Shield,
  AlertCircle,
  Calculator
} from 'lucide-react'
import { useSessionState } from '@/hooks/useSessionState'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { SettingsLayout } from '@/components/settings/SettingsLayout'

// 設定ページコンポーネント
import { GeneralSettings } from './pages/GeneralSettings'
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
import { BookingNoticeSettings } from './pages/BookingNoticeSettings'
import { SalarySettings } from './pages/SalarySettings'

// サイドバーのメニュー項目定義（2025-11-22 更新: 全体設定追加）
const SETTINGS_MENU_ITEMS: SidebarMenuItem[] = [
  // 全体設定
  { id: 'general', label: '全体設定', icon: SettingsIcon, description: 'システム全体の設定' },
  
  // 店舗別設定
  { id: 'store-basic', label: '店舗基本設定', icon: Building2, description: '店舗情報' },
  { id: 'business-hours', label: '営業時間', icon: Clock, description: '営業時間設定' },
  { id: 'performance-schedule', label: '公演スケジュール', icon: Calendar, description: 'スケジュール設定' },
  { id: 'reservation', label: '予約設定', icon: Users, description: '予約ルール' },
  { id: 'pricing', label: '料金設定', icon: DollarSign, description: '料金体系' },
  { id: 'salary', label: '給与設定', icon: Calculator, description: 'GM給与の計算式' },
  { id: 'staff', label: 'スタッフ設定', icon: UserCog, description: 'スタッフ管理' },
  { id: 'email', label: 'メール設定', icon: Mail, description: 'メールテンプレート' },
  { id: 'notifications', label: '通知設定', icon: Bell, description: '通知の設定' },
  { id: 'booking-notice', label: '注意事項設定', icon: AlertCircle, description: '予約時の注意事項' },
  { id: 'system', label: 'システム設定', icon: Shield, description: 'システム設定' },
  { id: 'data', label: 'データ管理', icon: Database, description: 'データ管理' }
]

export function Settings() {
  const [activeTab, setActiveTab] = useSessionState('settingsActiveTab', 'general')
  const { selectedStoreId, handleStoreChange } = useSettingsStore()

  // 全体設定ページかどうかを判定
  const isGlobalSettings = activeTab === 'general'

  const renderContent = () => {
    // 全体設定の場合は店舗IDを使用しない
    if (isGlobalSettings) {
      return <GeneralSettings />
    }

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
      case 'salary':
        return <SalarySettings />
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
      case 'booking-notice':
        return <BookingNoticeSettings />
      default:
        return <GeneralSettings />
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
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <SettingsLayout 
        selectedStoreId={selectedStoreId}
        onStoreChange={handleStoreChange}
        showStoreSelector={!isGlobalSettings}
      >
        {renderContent()}
      </SettingsLayout>
    </AppLayout>
  )
}

export default Settings

