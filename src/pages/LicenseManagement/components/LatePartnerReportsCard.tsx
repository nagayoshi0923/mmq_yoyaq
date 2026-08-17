import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { PartnerStoreLateReport } from '@/types'
import { formatJstDateTime } from '@/utils/jstDate'

type LatePartnerReportsCardProps = {
  reports: PartnerStoreLateReport[]
  onSelectPeriod?: (year: number, month: number) => void
}

export function LatePartnerReportsCard({ reports, onSelectPeriod }: LatePartnerReportsCardProps) {
  if (reports.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">対象月のあとで入った報告</CardTitle>
        <CardDescription>
          過去月をあとから報告された分です。見ている月を変えないと集計に入りません。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.map(report => (
          <div
            key={`${report.year}-${report.month}-${report.scenario_master_id}-${report.partner_store_id}-${report.submitted_at}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="warning">事後</Badge>
                <p className="font-medium">
                  {report.year}年{report.month}月 / {report.scenario_title}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {report.partner_store_name} · {report.performance_count}回 · ¥{report.license_fee.toLocaleString()}
                {' · '}報告 {formatJstDateTime(report.submitted_at)}
              </p>
            </div>
            {onSelectPeriod && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSelectPeriod(report.year, report.month)}
              >
                この月を見る
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
