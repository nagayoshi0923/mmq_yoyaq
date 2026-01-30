/**
 * 報告受付タブ - 他社からの公演報告を確認・承認
 */
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Search,
  Calendar,
  Building2,
  Users,
  Check,
  X,
  Loader2,
  FileText
} from 'lucide-react'
import { useLicenseReports } from '@/pages/LicenseReportManagement/hooks/useLicenseReports'
import { ReportApprovalDialog } from '@/pages/LicenseReportManagement/components/ReportApprovalDialog'
import { format } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'
import type { ExternalPerformanceReport } from '@/types'

interface ReportsReceivedProps {
  staffId: string
}

export function ReportsReceived({ staffId }: ReportsReceivedProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [searchTerm, setSearchTerm] = useState('')
  const { reports, isLoading, refetch } = useLicenseReports(statusFilter)
  const [selectedReport, setSelectedReport] = useState<ExternalPerformanceReport | null>(null)
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null)

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

  const filteredReports = reports.filter(report => {
    const scenarioTitle = report.scenarios?.title || ''
    const orgName = report.organizations?.name || ''
    const search = searchTerm.toLowerCase()
    return scenarioTitle.toLowerCase().includes(search) || 
           orgName.toLowerCase().includes(search)
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

      {/* 承認/却下ダイアログ */}
      {selectedReport && approvalAction && (
        <ReportApprovalDialog
          report={selectedReport}
          action={approvalAction}
          reviewerId={staffId}
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

