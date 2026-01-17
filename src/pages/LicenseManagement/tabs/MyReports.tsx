/**
 * 公演報告タブ - 自社が他社の管理シナリオを使った公演を報告
 */
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Calendar,
  Users,
  Clock,
  Loader2,
  FileText
} from 'lucide-react'
import { useExternalReports } from '@/pages/ExternalReports/hooks/useExternalReports'
import { ReportCreateDialog } from '@/pages/ExternalReports/components/ReportCreateDialog'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface MyReportsProps {
  organizationId: string
  staffId: string
}

export function MyReports({ organizationId, staffId }: MyReportsProps) {
  const { reports, isLoading, refetch } = useExternalReports()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          他社の管理シナリオを使った公演を報告します
        </p>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新規報告
        </Button>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{reports.length}</div>
            <div className="text-sm text-muted-foreground">総報告数</div>
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
            <div className="text-2xl font-bold text-amber-600">
              {reports.filter(r => r.status === 'pending').length}
            </div>
            <div className="text-sm text-muted-foreground">審査中</div>
          </CardContent>
        </Card>
      </div>

      {/* 報告一覧 */}
      <div className="space-y-3">
        <h2 className="font-semibold text-lg">報告履歴</h2>
        
        {reports.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              まだ公演報告がありません
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {report.scenarios?.title || '不明なシナリオ'}
                      </span>
                      {getStatusBadge(report.status)}
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
                    {report.venue_name && (
                      <div className="text-sm text-muted-foreground mt-1">
                        会場: {report.venue_name}
                      </div>
                    )}
                    {report.status === 'rejected' && report.rejection_reason && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                        却下理由: {report.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 inline mr-1" />
                    {format(new Date(report.created_at), 'MM/dd HH:mm', { locale: ja })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 報告作成ダイアログ */}
      <ReportCreateDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        organizationId={organizationId}
        staffId={staffId}
        onSuccess={() => {
          setIsCreateDialogOpen(false)
          refetch()
        }}
      />
    </div>
  )
}

