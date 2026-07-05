/**
 * 送信報告タブ上部の統計カード（SendReports から子コンポーネント抽出）。
 * DI-27 で StatCard/StatGrid 共通様式に統一（数値・ラベル・順序・表示条件は不変）。
 */
import { Users, Mail, AlertCircle, Building2, Calendar, JapaneseYen } from 'lucide-react'
import { StatCard, StatGrid } from '@/components/patterns/stat/StatCard'

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
    <StatGrid className="md:grid-cols-6">
      <StatCard label="作者数" value={stats.totalGroups} icon={Users} />
      <StatCard label="送信可" value={stats.withEmail} icon={Mail} tone="success" />
      <StatCard label="一部未登録" value={stats.partialEmail} icon={AlertCircle} tone="warning" />
      <StatCard label="未登録" value={stats.withoutEmail} icon={Building2} tone="destructive" />
      <StatCard
        label="総公演数"
        value={stats.totalEvents}
        icon={Calendar}
        sub={
          isLicenseManager && viewMode === 'all' ? (
            <>自社{stats.totalInternalEvents} / 他社{stats.totalExternalEvents}</>
          ) : undefined
        }
      />
      <StatCard label="総額" value={`¥${stats.totalLicense.toLocaleString()}`} icon={JapaneseYen} />
    </StatGrid>
  )
}
