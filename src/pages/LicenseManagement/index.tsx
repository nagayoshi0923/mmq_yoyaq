/**
 * @page LicenseManagement
 * @path #license-management
 * @purpose ライセンス管理の統合ページ（報告受付・公演報告・作者レポート・集計）
 * @access admin, staff（一部機能はライセンス管理組織のみ）
 */

import { AppLayout } from '@/components/layout/AppLayout'
import { UnifiedSidebar, SidebarMenuItem } from '@/components/layout/UnifiedSidebar'
import { Card, CardContent } from '@/components/ui/card'
import { 
  FileCheck, 
  Send, 
  BarChart3,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { useSessionState } from '@/hooks/useSessionState'

// 既存コンポーネントをインポート
import { ReportsReceived } from './tabs/ReportsReceived'
import { SendReports } from './tabs/SendReports'
import { LicenseSummary } from './tabs/LicenseSummary'

// サイドバーのメニュー項目定義
const LICENSE_MENU_ITEMS: SidebarMenuItem[] = [
  { id: 'received', label: '受信', icon: FileCheck, description: '他社からの公演報告' },
  { id: 'send', label: '送信', icon: Send, description: '作者・会社への報告' },
  { id: 'summary', label: '集計', icon: BarChart3, description: 'ライセンス料の集計' },
]

// ライセンス管理組織以外用のメニュー
const LICENSE_MENU_ITEMS_EXTERNAL: SidebarMenuItem[] = [
  { id: 'send', label: '送信', icon: Send, description: '作者・会社への報告' },
]

export default function LicenseManagement() {
  const { organization, staff, isLicenseManager, isLoading } = useOrganization()
  const [activeTab, setActiveTab] = useSessionState('licenseManagementTab', 'received')

  // メニュー項目を権限に応じて選択
  const menuItems = isLicenseManager ? LICENSE_MENU_ITEMS : LICENSE_MENU_ITEMS_EXTERNAL

  // ライセンス管理組織以外の場合、sendタブに強制
  const effectiveTab = isLicenseManager ? activeTab : 'send'

  // コンテンツの条件分岐表示
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (!organization || !staff) {
      return (
        <div className="p-4">
          <Card className="border-destructive">
            <CardContent className="p-6 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <p>組織情報が取得できませんでした。ログインしてください。</p>
            </CardContent>
          </Card>
        </div>
      )
    }

    switch (effectiveTab) {
      case 'received':
        return isLicenseManager ? <ReportsReceived staffId={staff.id} /> : null
      case 'send':
        return <SendReports organizationId={organization.id} staffId={staff.id} isLicenseManager={isLicenseManager} />
      case 'summary':
        return isLicenseManager ? <LicenseSummary /> : null
      default:
        return <SendReports organizationId={organization.id} staffId={staff.id} isLicenseManager={isLicenseManager} />
    }
  }

  return (
    <AppLayout
      currentPage="license-management"
      sidebar={
        <UnifiedSidebar
          title="ライセンス管理"
          mode="list"
          menuItems={menuItems}
          activeTab={effectiveTab}
          onTabChange={setActiveTab}
        />
      }
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      {renderContent()}
    </AppLayout>
  )
}
