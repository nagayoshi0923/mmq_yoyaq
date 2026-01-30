/**
 * ライセンス報告管理ページ（ライセンス管理組織向け）
 * - 外部公演報告の承認・却下
 * - ライセンス集計
 */
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  FileCheck, 
  Search,
  Calendar,
  Building2,
  Users,
  Check,
  X,
  Loader2,
  AlertCircle,
  BarChart3,
  FileText
} from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { useLicenseReports } from './hooks/useLicenseReports'
import { ReportApprovalDialog } from './components/ReportApprovalDialog'
import { LicenseSummaryCard } from './components/LicenseSummaryCard'
import { format } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'
import type { ExternalPerformanceReport } from '@/types'

export default function LicenseReportManagement() {
  const { organization, staff, isLicenseManager, isLoading: orgLoading } = useOrganization()
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const { reports, summary, isLoading, error, refetch } = useLicenseReports(statusFilter)
  const [selectedReport, setSelectedReport] = useState<ExternalPerformanceReport | null>(null)
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null)

  // ステータスのバッジ
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">承認済み</Badge>
      case 'rejected':
        return <Badge variant="destructive">却下</Badge>
      default:
        return <Badge variant="secondary">審査中</Badge>
    }
  }

  // 検索フィルター
  const filteredReports = reports.filter(report => {
    const scenarioTitle = report.scenarios?.title || ''
    const orgName = report.organizations?.name || ''
    const search = searchTerm.toLowerCase()
    return scenarioTitle.toLowerCase().includes(search) || 
           orgName.toLowerCase().includes(search)
  })

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isLicenseManager) {
    return (
      <div className="p-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <p className="text-amber-800">
              このページはライセンス管理組織のみアクセス可能です。
            </p>
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
          ライセンス報告管理
        </h1>
        <p className="text-muted-foreground mt-1">
          外部からの公演報告の確認と承認
        </p>
      </div>

      <Tabs defaultValue="reports" className="space-y-6">
        <TabsList>
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            報告一覧
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            集計
          </TabsTrigger>
        </TabsList>

        {/* 報告一覧タブ */}
        <TabsContent value="reports" className="space-y-6">
          {/* フィルター */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="シナリオ名または組織名で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v: 'all' | 'pending' | 'approved' | 'rejected') => setStatusFilter(v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="pending">審査中</SelectItem>
                <SelectItem value="approved">承認済み</SelectItem>
                <SelectItem value="rejected">却下</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 統計 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{reports.length}</div>
                <div className="text-sm text-muted-foreground">総報告数</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-600">
                  {reports.filter(r => r.status === 'pending').length}
                </div>
                <div className="text-sm text-muted-foreground">審査待ち</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {reports.filter(r => r.status === 'approved').length}
                </div>
                <div className="text-sm text-muted-foreground">承認済み</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {reports.filter(r => r.status === 'rejected').length}
                </div>
                <div className="text-sm text-muted-foreground">却下</div>
              </CardContent>
            </Card>
          </div>

          {/* 報告一覧 */}
          <div className="space-y-3">
            {filteredReports.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {searchTerm ? '検索結果がありません' : '報告がありません'}
                </CardContent>
              </Card>
            ) : (
              filteredReports.map((report) => (
                <Card key={report.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            {report.scenarios?.title || '不明なシナリオ'}
                          </span>
                          {getStatusBadge(report.status)}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">
                            {report.organizations?.name || '不明な組織'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(report.performance_date), 'yyyy/MM/dd', { locale: ja })}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {report.performance_count}回
                          </span>
                          {report.participant_count && (
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {report.participant_count}名
                            </span>
                          )}
                        </div>
                        {report.notes && (
                          <div className="text-sm text-muted-foreground mt-2 bg-muted p-2 rounded">
                            {report.notes}
                          </div>
                        )}
                      </div>
                      
                      {report.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 hover:bg-green-50"
                            onClick={() => {
                              setSelectedReport(report)
                              setApprovalAction('approve')
                            }}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            承認
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setSelectedReport(report)
                              setApprovalAction('reject')
                            }}
                          >
                            <X className="w-4 h-4 mr-1" />
                            却下
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* 集計タブ */}
        <TabsContent value="summary" className="space-y-6">
          <LicenseSummaryCard summary={summary} />
        </TabsContent>
      </Tabs>

      {/* 承認/却下ダイアログ */}
      {selectedReport && approvalAction && staff && (
        <ReportApprovalDialog
          report={selectedReport}
          action={approvalAction}
          reviewerId={staff.id}
          isOpen={!!selectedReport}
          onClose={() => {
            setSelectedReport(null)
            setApprovalAction(null)
          }}
          onSuccess={() => {
            setSelectedReport(null)
            setApprovalAction(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

