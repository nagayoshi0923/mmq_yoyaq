import React, { useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/layout/PageHeader'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { CalendarCheck, TrendingUp, Clock, Users } from 'lucide-react'
import { useOpenEventAnalysis } from '../hooks/useOpenEventAnalysis'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface Store {
  id: string
  name: string
  short_name: string
  region?: string
}

interface OpenEventAnalysisProps {
  stores: Store[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
}

const BAR_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => `${ctx.parsed.y.toFixed(1)}%`
      }
    }
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      ticks: { callback: (v: any) => `${v}%` }
    }
  }
}

export const OpenEventAnalysis: React.FC<OpenEventAnalysisProps> = ({
  stores,
  selectedStoreIds,
  onStoreIdsChange
}) => {
  const {
    loading,
    period,
    dateRange,
    stats,
    monthlyBreakdown,
    weekdayBreakdown,
    timeSlotBreakdown,
    scenarioBreakdown,
    loadOpenEventData
  } = useOpenEventAnalysis()

  useEffect(() => {
    if (stores.length > 0) {
      loadOpenEventData(period, selectedStoreIds)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.length, selectedStoreIds])

  const handlePeriodChange = (newPeriod: string) => {
    loadOpenEventData(newPeriod, selectedStoreIds)
  }

  const monthlyChartData = useMemo(() => ({
    labels: monthlyBreakdown.map(m => m.month),
    datasets: [{ label: '満席率', data: monthlyBreakdown.map(m => m.fullRate), backgroundColor: 'rgba(59, 130, 246, 0.7)', borderRadius: 4 }]
  }), [monthlyBreakdown])

  const weekdayChartData = useMemo(() => ({
    labels: weekdayBreakdown.map(w => w.weekday),
    datasets: [{ label: '満席率', data: weekdayBreakdown.map(w => w.fullRate), backgroundColor: 'rgba(16, 185, 129, 0.7)', borderRadius: 4 }]
  }), [weekdayBreakdown])

  const timeSlotChartData = useMemo(() => ({
    labels: timeSlotBreakdown.map(t => t.slot),
    datasets: [{ label: '満席率', data: timeSlotBreakdown.map(t => t.fullRate), backgroundColor: 'rgba(245, 158, 11, 0.7)', borderRadius: 4 }]
  }), [timeSlotBreakdown])

  const hasData = stats.totalEvents > 0

  return (
    <div className="space-y-4 md:space-y-6">
      {/* ヘッダー */}
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">公演分析</span>
          </div>
        }
        description="オープン公演の満席率・満席日数を分析します"
      >
        <Select value={period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thisMonth">今月</SelectItem>
            <SelectItem value="lastMonth">先月</SelectItem>
            <SelectItem value="past30days">過去30日間</SelectItem>
            <SelectItem value="past90days">過去90日間</SelectItem>
            <SelectItem value="past180days">過去180日間</SelectItem>
            <SelectItem value="thisYear">今年</SelectItem>
            <SelectItem value="lastYear">昨年</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="text-xs text-muted-foreground">
        期間: {dateRange.startDate} ～ {dateRange.endDate}
      </div>

      {/* 店舗選択 */}
      <div className="w-64">
        <StoreMultiSelect
          stores={stores}
          selectedStoreIds={selectedStoreIds}
          onStoreIdsChange={onStoreIdsChange}
          label="店舗選択"
          placeholder="全店舗"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          読み込み中...
        </div>
      )}

      {!loading && !hasData && (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          この期間のオープン公演データがありません
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* サマリーカード */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card className="shadow-none border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-muted-foreground">総公演数</CardTitle>
                <CalendarCheck className="h-4 w-4 text-blue-500 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold">{stats.totalEvents}<span className="text-sm font-normal ml-1">件</span></div>
                <p className="text-xs text-muted-foreground mt-1">満席 {stats.fullEvents}件</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-blue-800">満席率</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-blue-900">{stats.fullRate.toFixed(1)}<span className="text-sm font-normal ml-0.5">%</span></div>
                <p className="text-xs text-blue-700 mt-1">{stats.fullEvents}/{stats.totalEvents} 公演</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-amber-800">平均満席日数</CardTitle>
                <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-amber-900">
                  {stats.avgDaysToFull > 0 ? stats.avgDaysToFull.toFixed(1) : '—'}
                  {stats.avgDaysToFull > 0 && <span className="text-sm font-normal ml-1">日</span>}
                </div>
                <p className="text-xs text-amber-700 mt-1">公演作成日から満席まで</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3 md:p-4">
                <CardTitle className="text-sm text-green-800">平均充填率</CardTitle>
                <Users className="h-4 w-4 text-green-600 flex-shrink-0" />
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="text-2xl font-bold text-green-900">{stats.avgFillRate.toFixed(1)}<span className="text-sm font-normal ml-0.5">%</span></div>
                <p className="text-xs text-green-700 mt-1">max_participants 対比</p>
              </CardContent>
            </Card>
          </div>

          {/* 月別満席率グラフ */}
          {monthlyBreakdown.length > 0 && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">月別 満席率推移</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-48 md:h-64">
                  <Bar data={monthlyChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 曜日別・時間帯別グラフ */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">曜日別 満席率</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-40 md:h-48">
                  <Bar data={weekdayChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">時間帯別 満席率</CardTitle>
              </CardHeader>
              <CardContent className="p-3 md:p-4 pt-0">
                <div className="h-40 md:h-48">
                  <Bar data={timeSlotChartData} options={BAR_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* シナリオ別テーブル */}
          {scenarioBreakdown.length > 0 && (
            <Card className="shadow-none border">
              <CardHeader className="p-3 md:p-4">
                <CardTitle className="text-sm">シナリオ別 分析</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-3 font-medium text-muted-foreground">シナリオ</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">公演数</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">満席数</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">満席率</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">平均満席日数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenarioBreakdown.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 font-medium truncate max-w-[200px]">{row.scenarioTitle}</td>
                          <td className="p-3 text-right">{row.totalEvents}</td>
                          <td className="p-3 text-right">{row.fullEvents}</td>
                          <td className="p-3 text-right">
                            <span className={`font-medium ${row.fullRate >= 80 ? 'text-blue-600' : row.fullRate >= 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {row.fullRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-right text-muted-foreground">
                            {row.avgDaysToFull > 0 ? `${row.avgDaysToFull.toFixed(1)} 日` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
