/**
 * @page LicenseManagement
 * @path #license-management
 * @purpose ライセンス管理の統合ページ（報告受付・公演報告・作者レポート・集計）
 * @access admin, staff（一部機能はライセンス管理組織のみ）
 */

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { 
  FileCheck, 
  FileText, 
  Send, 
  BarChart3,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { useSessionState } from '@/hooks/useSessionState'

// 既存コンポーネントをインポート
import { ReportsReceived } from './tabs/ReportsReceived'
import { MyReports } from './tabs/MyReports'
import { AuthorReports } from './tabs/AuthorReports'
import { LicenseSummary } from './tabs/LicenseSummary'

export default function LicenseManagement() {
  const { organization, staff, isLicenseManager, isLoading } = useOrganization()
  const [activeTab, setActiveTab] = useSessionState('licenseManagementTab', 'received')

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

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCheck className="w-6 h-6" />
          ライセンス管理
        </h1>
        <p className="text-muted-foreground mt-1">
          公演報告の送受信と作者へのレポート管理
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          {isLicenseManager && (
            <TabsTrigger value="received" className="flex items-center gap-2">
              <FileCheck className="w-4 h-4" />
              <span className="hidden sm:inline">報告受付</span>
              <span className="sm:hidden">受付</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="my-reports" className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">公演報告</span>
            <span className="sm:hidden">報告</span>
          </TabsTrigger>
          {isLicenseManager && (
            <TabsTrigger value="author-reports" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">作者レポート</span>
              <span className="sm:hidden">作者</span>
            </TabsTrigger>
          )}
          {isLicenseManager && (
            <TabsTrigger value="summary" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">集計</span>
              <span className="sm:hidden">集計</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* 報告受付タブ（ライセンス管理組織のみ） */}
        {isLicenseManager && (
          <TabsContent value="received">
            <ReportsReceived staffId={staff.id} />
          </TabsContent>
        )}

        {/* 公演報告タブ（自社→他社への報告） */}
        <TabsContent value="my-reports">
          <MyReports organizationId={organization.id} staffId={staff.id} />
        </TabsContent>

        {/* 作者レポートタブ（ライセンス管理組織のみ） */}
        {isLicenseManager && (
          <TabsContent value="author-reports">
            <AuthorReports />
          </TabsContent>
        )}

        {/* 集計タブ（ライセンス管理組織のみ） */}
        {isLicenseManager && (
          <TabsContent value="summary">
            <LicenseSummary />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

