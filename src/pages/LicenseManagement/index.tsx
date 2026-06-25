/**
 * @page LicenseManagement
 * @path #license-management
 * @purpose ライセンス管理の統合ページ（報告受付・公演報告・作者レポート・集計）
 * @access admin, staff（一部機能はライセンス管理組織のみ）
 */
import { useSearchParams } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, AlertCircle, FileCheck } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { ReportsReceived } from './tabs/ReportsReceived'
import { SendReports } from './tabs/SendReports'
import { LicenseSummary } from './tabs/LicenseSummary'
import { ContractMaster } from './tabs/ContractMaster'

export default function LicenseManagement() {
  const { organization, staff, isLicenseManager, isLoading } = useOrganization()
  const [searchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'send'
  const canManageContracts = Boolean(staff?.role?.includes('admin') || staff?.role?.includes('license_admin'))
  const canViewContracts = Boolean(canManageContracts || staff?.role?.includes('staff'))
  // ライセンス管理組織以外は send 固定
  const effectiveTab = isLicenseManager || rawTab === 'contracts' ? rawTab : 'send'

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
      case 'contracts': return canViewContracts ? <ContractMaster canEdit={canManageContracts} /> : null
      case 'received': return isLicenseManager ? <ReportsReceived staffId={staff.id} /> : null
      case 'summary':  return isLicenseManager ? <LicenseSummary /> : null
      default:         return <SendReports organizationId={organization.id} staffId={staff.id} isLicenseManager={isLicenseManager} />
    }
  }

  return (
    <AppLayout
      currentPage="license-management"
      maxWidth="max-w-[1440px]"
      containerPadding="px-[10px] py-3 sm:py-4 md:py-6"
      stickyLayout={true}
    >
      <PageHeader
        title={<><FileCheck className="h-5 w-5" />ライセンス管理</>}
        description="公演報告の送信・受信・ライセンス料の集計"
      />
      {renderContent()}
    </AppLayout>
  )
}
