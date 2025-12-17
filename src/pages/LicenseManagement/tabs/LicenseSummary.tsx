/**
 * 集計タブ - ライセンス全体のサマリー
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { useLicenseReports } from '@/pages/LicenseReportManagement/hooks/useLicenseReports'
import { LicenseSummaryCard } from '@/pages/LicenseReportManagement/components/LicenseSummaryCard'

export function LicenseSummary() {
  const { summary, isLoading } = useLicenseReports('all')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <LicenseSummaryCard summary={summary} />
    </div>
  )
}

