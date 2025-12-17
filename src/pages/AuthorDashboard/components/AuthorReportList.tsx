/**
 * 作者向け公演報告リスト
 */

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Calendar, Building2, Search, Users } from 'lucide-react'
import type { AuthorPerformanceReport } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface AuthorReportListProps {
  reports: AuthorPerformanceReport[]
  compact?: boolean
  onRefresh?: () => void
}

export function AuthorReportList({ reports, compact = false, onRefresh }: AuthorReportListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      report.scenario_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.organization_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (report.venue_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    
    const matchesStatus = statusFilter === 'all' || report.report_status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">承認済み</Badge>
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">審査中</Badge>
      case 'rejected':
        return <Badge className="bg-red-500/10 text-red-600 hover:bg-red-500/20">却下</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>まだ公演報告がありません</p>
        <p className="text-sm mt-2">
          他の会社があなたのシナリオを使用して報告すると、ここに表示されます
        </p>
      </div>
    )
  }

  // コンパクト表示（ダッシュボードの概要用）
  if (compact) {
    return (
      <div className="space-y-3">
        {filteredReports.map(report => (
          <div 
            key={report.report_id}
            className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
          >
            <div className="flex-1">
              <p className="font-medium">{report.scenario_title}</p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {report.organization_name}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(report.performance_date), 'M/d', { locale: ja })}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold">¥{report.calculated_license_fee.toLocaleString()}</p>
              {getStatusBadge(report.report_status)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // フル表示
  return (
    <div className="space-y-4">
      {/* フィルター */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="シナリオ名、会社名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="approved">承認済み</SelectItem>
            <SelectItem value="pending">審査中</SelectItem>
            <SelectItem value="rejected">却下</SelectItem>
          </SelectContent>
        </Select>
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh}>
            更新
          </Button>
        )}
      </div>

      {/* テーブル */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>報告日</TableHead>
              <TableHead>シナリオ</TableHead>
              <TableHead>報告元</TableHead>
              <TableHead className="text-center">公演回数</TableHead>
              <TableHead className="text-center">参加者数</TableHead>
              <TableHead className="text-right">ライセンス料</TableHead>
              <TableHead className="text-center">ステータス</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReports.map(report => (
              <TableRow key={report.report_id}>
                <TableCell>
                  {format(new Date(report.performance_date), 'yyyy/MM/dd', { locale: ja })}
                </TableCell>
                <TableCell className="font-medium">{report.scenario_title}</TableCell>
                <TableCell>
                  <div>
                    <p>{report.organization_name}</p>
                    {report.venue_name && (
                      <p className="text-sm text-muted-foreground">{report.venue_name}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">{report.performance_count}</TableCell>
                <TableCell className="text-center">
                  {report.participant_count ?? '-'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ¥{report.calculated_license_fee.toLocaleString()}
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(report.report_status)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 集計 */}
      <div className="flex justify-end gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">表示件数: </span>
          <span className="font-medium">{filteredReports.length} 件</span>
        </div>
        <div>
          <span className="text-muted-foreground">合計ライセンス料: </span>
          <span className="font-bold">
            ¥{filteredReports
              .filter(r => r.report_status === 'approved')
              .reduce((sum, r) => sum + r.calculated_license_fee, 0)
              .toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}

