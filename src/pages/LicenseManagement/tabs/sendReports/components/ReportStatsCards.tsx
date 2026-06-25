/**
 * 送信報告タブ上部の統計カード（SendReports から子コンポーネント抽出・挙動不変）。
 * JSX は元 SendReports の該当ブロックを逐語移植し、依存（stats/フラグ）を props 化しただけ。
 */
import { Users, Mail, AlertCircle, Building2, Calendar, JapaneseYen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface ReportStats {
  totalGroups: number
  withEmail: number
  partialEmail: number
  withoutEmail: number
  totalEvents: number
  totalInternalEvents: number
  totalExternalEvents: number
  totalLicense: number
}

interface ReportStatsCardsProps {
  stats: ReportStats
  isLicenseManager: boolean
  viewMode: 'all' | 'internal' | 'external'
}

export function ReportStatsCards({ stats, isLicenseManager, viewMode }: ReportStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      <Card>
        <CardContent className="p-4 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-2xl font-bold">{stats.totalGroups}</div>
          <div className="text-sm text-muted-foreground">作者数</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <Mail className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <div className="text-2xl font-bold">{stats.withEmail}</div>
          <div className="text-sm text-muted-foreground">送信可</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <AlertCircle className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
          <div className="text-2xl font-bold">{stats.partialEmail}</div>
          <div className="text-sm text-muted-foreground">一部未登録</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <Building2 className="w-5 h-5 mx-auto mb-1 text-orange-500" />
          <div className="text-2xl font-bold">{stats.withoutEmail}</div>
          <div className="text-sm text-muted-foreground">未登録</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <Calendar className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-2xl font-bold">{stats.totalEvents}</div>
          <div className="text-sm text-muted-foreground flex flex-col">
            <span>総公演数</span>
            {isLicenseManager && viewMode === 'all' && (
              <span className="text-xs">
                (自社{stats.totalInternalEvents} / 他社{stats.totalExternalEvents})
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <JapaneseYen className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <div className="text-2xl font-bold">¥{stats.totalLicense.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground">総額</div>
        </CardContent>
      </Card>
    </div>
  )
}
