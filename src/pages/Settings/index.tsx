import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSettingsStore } from '@/hooks/useSettingsStore'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { SettingsOverview } from '@/components/settings/SettingsOverview'
import { getSettingsPage, settingsPath, SETTINGS_SCOPES } from '@/components/settings/settingsCatalog'
import { useOrganization, checkIsLicenseAdmin } from '@/hooks/useOrganization'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'

// 設定ページコンポーネント
import { ShiftSettings } from './pages/ShiftSettings'
import { BusinessHoursSettings } from './pages/BusinessHoursSettings'
import { PerformanceScheduleSettings } from './pages/PerformanceScheduleSettings'
import { ReservationSettings } from './pages/ReservationSettings'
import { CancellationSettings } from './pages/CancellationSettings'
import { CancellationBilling } from './pages/CancellationBilling'
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
import { PrivateBookingSettings } from './pages/PrivateBookingSettings'
import { RecruitmentSettings } from './pages/RecruitmentSettings'
import { BlogSettings } from './pages/BlogSettings'

export function Settings() {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'
  const page = getSettingsPage(activeTab)
  const allowAll = activeTab === 'cancellation'
  const { selectedStoreId, handleStoreChange, stores, loading, error } = useSettingsStore(allowAll)
  const { organization, organizationId } = useOrganization()
  const { user } = useAuth()
  const slug = organization?.slug
  const showStoreSelector = page?.scope === 'store'
  const selectedStore = stores.find(store => store.id === selectedStoreId)
  const scope = SETTINGS_SCOPES.find(item => item.id === searchParams.get('scope'))?.id

  if (slug && ['pricing', 'sales-report'].includes(activeTab)) {
    return <Navigate replace to={settingsPath(slug)} />
  }

  const renderContent = () => {
    // 全店舗選択時は店舗IDを空文字列に
    const storeId = selectedStoreId === 'all' ? '' : selectedStoreId

    switch (activeTab) {
      case 'organization-time-slots':
        return <PerformanceScheduleSettings scope="organization" />
      case 'store-notifications':
        return <NotificationSettings storeId={storeId} scope="store" />
      case 'private-booking':
        return <PrivateBookingSettings />
      case 'recruitment':
        return <RecruitmentSettings />
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
        return <PerformanceScheduleSettings storeId={storeId} scope="store" />
      case 'reservation':
        return <ReservationSettings storeId={storeId} />
      case 'cancellation':
        return <CancellationSettings storeId={storeId} />
      case 'cancellation-billing':
        return <CancellationBilling />
      case 'salary':
        return <SalarySettings />
      case 'notifications':
        return <NotificationSettings scope="organization" />
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
        return slug ? <SettingsOverview slug={slug} scope={scope} storeId={selectedStoreId === 'all' ? undefined : selectedStoreId} isPlatformAdmin={checkIsLicenseAdmin(user?.role, organizationId)} /> : null
    }
  }

  return (
    <AppLayout
      currentPage="settings"
      maxWidth="max-w-[1440px]"
      containerPadding="px-4 md:px-6 py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <PageHeader
        title={<><SettingsIcon className="h-5 w-5" />設定</>}
        description="組織共通・店舗別・作品別・公演別の設定"
      />
      {slug && page && <div className="space-y-3 mb-6">
        <Link className="underline" to={settingsPath(slug)}>設定一覧</Link>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{page.scope === 'organization' ? '組織共通' : '店舗別'}</Badge><span>{page.scope === 'organization' ? organization?.name : selectedStoreId === 'all' ? '全店舗へ一括設定' : selectedStore?.name || '店舗を選択してください'}</span></div>
        <p>{page.effect}</p>
        {page.related && <nav aria-label="関連する設定" className="flex flex-wrap gap-4">{page.related.map(id => <Link className="underline" key={id} to={settingsPath(slug, id, getSettingsPage(id)?.scope === 'store' ? selectedStoreId : undefined)}>{getSettingsPage(id)?.label}</Link>)}</nav>}
      </div>}
      <SettingsLayout
        stores={stores}
        allowAll={allowAll}
        selectedStoreId={selectedStoreId}
        onStoreChange={handleStoreChange}
        showStoreSelector={showStoreSelector}
      >
        {showStoreSelector && (loading || error || !selectedStoreId)
          ? <p role="status">{loading ? '店舗を確認しています…' : error || (stores.length ? 'この店舗は選択できません。店舗を選び直してください。' : '設定する店舗を店舗管理から登録してください。')}</p>
          : <div key={`${organizationId}:${activeTab}:${showStoreSelector ? selectedStoreId : ''}`}>{renderContent()}</div>}
      </SettingsLayout>
    </AppLayout>
  )
}

export default Settings
