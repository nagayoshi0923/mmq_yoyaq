/**
 * 報告受付タブ - 他社からの公演報告を確認・承認
 */
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  Calendar,
  Building2,
  Users,
  Check,
  X,
  FileText
} from 'lucide-react'
import { StatCard, StatGrid } from '@/components/patterns/stat/StatCard'
import { FilterBar, FilterSelect, SearchInput } from '@/components/patterns/filter'
import { EmptyState } from '@/components/patterns/list/EmptyState'
import { ListSkeleton } from '@/components/patterns/list/ListSkeleton'
import { useLicenseReports } from '@/pages/LicenseReportManagement/hooks/useLicenseReports'
import { ReportApprovalDialog } from '@/pages/LicenseReportManagement/components/ReportApprovalDialog'
import { format } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'
import type { ExternalPerformanceReport } from '@/types'

const STATUS_FILTER_DEFAULT = 'pending'

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '審査中' },
  { value: 'approved', label: '承認済み' },
  { value: 'rejected', label: '却下' },
]

interface ReportsReceivedProps {
  staffId: string
}

export function ReportsReceived({ staffId }: ReportsReceivedProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(STATUS_FILTER_DEFAULT)
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
    return <ListSkeleton rows={4} variant="card" />
  }

  return (
    <div className="space-y-6">
      {/* フィルター */}
      <FilterBar
        isDirty={searchTerm !== '' || statusFilter !== STATUS_FILTER_DEFAULT}
        onReset={() => {
          setSearchTerm('')
          setStatusFilter(STATUS_FILTER_DEFAULT)
        }}
      >
        <SearchInput
          placeholder="シナリオ名または組織名で検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          containerClassName="flex-1 min-w-[240px] max-w-md"
        />
        <FilterSelect
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | 'pending' | 'approved' | 'rejected')}
          options={STATUS_FILTER_OPTIONS}
        />
      </FilterBar>

      {/* 統計 */}
      <StatGrid>
        <StatCard label="総報告数" value={reports.length} />
        <StatCard
          label="審査待ち"
          value={reports.filter(r => r.status === 'pending').length}
          tone="warning"
        />
        <StatCard
          label="承認済み"
          value={reports.filter(r => r.status === 'approved').length}
          tone="success"
        />
        <StatCard
          label="却下"
          value={reports.filter(r => r.status === 'rejected').length}
          tone="destructive"
        />
      </StatGrid>

      {/* 報告一覧 */}
      <div className="space-y-3">
        {filteredReports.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <EmptyState
                icon={Search}
                title={searchTerm ? '検索結果がありません' : '報告がありません'}
              />
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

