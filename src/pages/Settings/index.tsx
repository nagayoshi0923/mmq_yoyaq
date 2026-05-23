import { useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { SettingsLayout } from '@/components/settings/SettingsLayout'

// 設定ページコンポーネント
import { ShiftSettings } from './pages/ShiftSettings'
import { BusinessHoursSettings } from './pages/BusinessHoursSettings'
import { PerformanceScheduleSettings } from './pages/PerformanceScheduleSettings'
import { ReservationSettings } from './pages/ReservationSettings'
import { CancellationSettings } from './pages/CancellationSettings'
import { PricingSettings } from './pages/PricingSettings'
import { SalesReportSettings } from './pages/SalesReportSettings'
import { NotificationSettings } from './pages/NotificationSettings'
import { SystemSettings } from './pages/SystemSettings'
import { EmailSettings } from './pages/EmailSettings'
import { EmailLogsSettings } from './pages/EmailLogsSettings'
import { DataManagementSettings } from './pages/DataManagementSettings'
import { BookingNoticeSettings } from './pages/BookingNoticeSettings'
import { SalarySettings } from './pages/SalarySettings'
import { OrganizationInfoSettings } from './pages/OrganizationInfoSettings'
import { CategoryAuthorManagementSettings } from './pages/CategoryAuthorManagementSettings'
import { OrganizationDesignSettings } from './pages/OrganizationDesignSettings'
import { FAQSettings } from './pages/FAQSettings'
import { BlogSettings } from './pages/BlogSettings'

export function Settings() {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'organization-info'
  const { selectedStoreId, handleStoreChange } = useSettingsStore()

  // 店舗セレクターを表示しないページ
  const noStoreSelectorPages = ['organization-info', 'organization-design', 'faq', 'blog', 'shift', 'salary', 'booking-notice', 'categories', 'email-logs', 'staff', 'system', 'notifications', 'data', 'customer']
  const showStoreSelector = !noStoreSelectorPages.includes(activeTab)

  const renderContent = () => {
    // 全店舗選択時は店舗IDを空文字列に
    const storeId = selectedStoreId === 'all' ? '' : selectedStoreId

    switch (activeTab) {
      case 'organization-info':
        return <OrganizationInfoSettings />
      case 'organization-design':
        return <OrganizationDesignSettings />
      case 'faq':
        return <FAQSettings />
      case 'blog':
        return <BlogSettings />
      case 'shift':
        return <ShiftSettings />
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
      case 'system':
        return <SystemSettings storeId={storeId} />
      case 'email':
        return <EmailSettings storeId={storeId} />
      case 'email-logs':
        return <EmailLogsSettings />
      case 'data':
        return <DataManagementSettings storeId={storeId} />
      case 'booking-notice':
        return <BookingNoticeSettings />
      case 'categories':
        return <CategoryAuthorManagementSettings />
      default:
        return <OrganizationInfoSettings />
    }
  }

  return (
    <AppLayout
      currentPage="settings"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <PageHeader
        title={<><SettingsIcon className="h-5 w-5" />設定</>}
        description="組織情報・店舗・通知・連携などの各種設定"
      />
      <SettingsLayout
        selectedStoreId={selectedStoreId}
        onStoreChange={handleStoreChange}
        showStoreSelector={showStoreSelector}
      >
        {renderContent()}
      </SettingsLayout>
    </AppLayout>
  )
}

export default Settings
