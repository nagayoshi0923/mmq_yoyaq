import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MonthSwitcher } from '@/components/patterns/calendar'
import { licensePartnerReportsApi } from '@/lib/api/licensePartnerReportsApi'
import { LatePartnerReportsCard } from '../components/LatePartnerReportsCard'
import { PartnerStoreReportTable } from '../components/PartnerStoreReportTable'

function currentMonthDate() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
}

export function AuthorPartnerReports() {
  const [currentDate, setCurrentDate] = useState(currentMonthDate)
  const [view, setView] = useState<'month' | 'year'>('month')
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const { data, isLoading } = useQuery({
    queryKey: ['license-partner-reports', 'staff', year, view === 'month' ? month : null],
    queryFn: () => licensePartnerReportsApi.staff(year, view === 'month' ? month : null),
  })

  const periodLabel = useMemo(() => {
    return view === 'year' ? `${year}年` : `${year}年${month}月`
  }, [month, view, year])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher
          value={currentDate}
          onChange={setCurrentDate}
          showToday
          quickJump
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === 'month' ? 'default' : 'outline'}
            onClick={() => setView('month')}
          >
            月次
          </Button>
          <Button
            size="sm"
            variant={view === 'year' ? 'default' : 'outline'}
            onClick={() => setView('year')}
          >
            年まとめ
          </Button>
        </div>
      </div>

      <LatePartnerReportsCard
        reports={data?.late_reports ?? []}
        onSelectPeriod={(nextYear, nextMonth) => {
          setView('month')
          setCurrentDate(new Date(nextYear, nextMonth - 1, 1, 12, 0, 0, 0))
        }}
      />

      <Card>
        <CardContent className="flex flex-wrap gap-6 pt-6">
          <div>
            <p className="text-sm text-muted-foreground">{periodLabel}の公演回数</p>
            <p className="text-2xl font-bold">{data?.totals.performance_count ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ライセンス料</p>
            <p className="text-2xl font-bold">¥{(data?.totals.license_fee ?? 0).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PartnerStoreReportTable
          rows={data?.rows ?? []}
          showAuthor
          emptyMessage={`${periodLabel}の店舗別報告はまだありません`}
        />
      )}
    </div>
  )
}
