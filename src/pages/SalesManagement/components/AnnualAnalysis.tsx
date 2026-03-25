import React, { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bar, Line } from 'react-chartjs-2'
import { useAnnualAnalysis } from '../hooks/useAnnualAnalysis'
import { TrendingUp, TrendingDown, Calendar, Banknote } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'

interface AnnualAnalysisProps {
  stores: Array<{ id: string; name: string; short_name: string; ownership_type?: string }>
  selectedStoreIds: string[]
}

const YEAR_COLORS = [
  { border: 'rgba(156, 163, 175, 0.6)', bg: 'rgba(156, 163, 175, 0.15)' },
  { border: 'rgba(156, 163, 175, 0.7)', bg: 'rgba(156, 163, 175, 0.2)' },
  { border: 'rgba(59, 130, 246, 0.6)', bg: 'rgba(59, 130, 246, 0.15)' },
  { border: 'rgba(16, 185, 129, 0.7)', bg: 'rgba(16, 185, 129, 0.2)' },
  { border: 'rgba(239, 68, 68, 0.9)', bg: 'rgba(239, 68, 68, 0.15)' },
]

const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export function AnnualAnalysis({ stores, selectedStoreIds }: AnnualAnalysisProps) {
  const corporateStoreIds = useMemo(() => {
    if (selectedStoreIds.length > 0) return selectedStoreIds
    return stores.filter(s => s.ownership_type !== 'franchise').map(s => s.id)
  }, [stores, selectedStoreIds])

  const { annualData, loading, error } = useAnnualAnalysis(corporateStoreIds)

  const currentYearData = annualData.length > 0 ? annualData[annualData.length - 1] : null
  const lastYearData = annualData.length > 1 ? annualData[annualData.length - 2] : null

  const barChartData = useMemo(() => {
    if (annualData.length === 0) return null
    return {
      labels: annualData.map(d => `${d.year}年`),
      datasets: [{
        label: '年間売上',
        data: annualData.map(d => d.totalRevenue),
        backgroundColor: annualData.map((_, i) => {
          const colorIdx = Math.min(i, YEAR_COLORS.length - 1)
          return YEAR_COLORS[colorIdx].bg
        }),
        borderColor: annualData.map((_, i) => {
          const colorIdx = Math.min(i, YEAR_COLORS.length - 1)
          return YEAR_COLORS[colorIdx].border
        }),
        borderWidth: 2,
        borderRadius: 6,
      }],
    }
  }, [annualData])

  const barChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const value = ctx.parsed.y
            const formatted = `¥${value.toLocaleString()}`
            const yearData = annualData[ctx.dataIndex]
            const parts = [formatted]
            if (yearData?.growthRate !== null && yearData?.growthRate !== undefined) {
              const sign = yearData.growthRate >= 0 ? '+' : ''
              parts.push(`前年比: ${sign}${yearData.growthRate.toFixed(1)}%`)
            }
            parts.push(`公演数: ${yearData?.totalEvents || 0}回`)
            return parts
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `¥${(value / 10000).toFixed(0)}万`,
        },
      },
    },
  }), [annualData])

  const lineChartData = useMemo(() => {
    if (annualData.length === 0) return null
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    return {
      labels: MONTH_LABELS,
      datasets: annualData.map((yearData, idx) => {
        const colorIdx = Math.min(idx, YEAR_COLORS.length - 1)
        const isCurrentYear = yearData.year === currentYear
        const data = yearData.monthlyRevenue.map((v, m) => {
          if (isCurrentYear && m > currentMonth) return null
          if (v === 0 && yearData.monthlyEvents[m] === 0) {
            if (yearData.year < currentYear) return 0
            if (isCurrentYear && m > currentMonth) return null
            if (isCurrentYear && m <= currentMonth) return 0
            return null
          }
          return v
        })

        return {
          label: `${yearData.year}年`,
          data,
          borderColor: YEAR_COLORS[colorIdx].border,
          backgroundColor: YEAR_COLORS[colorIdx].bg,
          borderWidth: isCurrentYear ? 3 : 1.5,
          pointRadius: isCurrentYear ? 4 : 2,
          pointHoverRadius: 6,
          tension: 0.3,
          spanGaps: false,
        }
      }),
    }
  }, [annualData])

  const lineChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (ctx.parsed.y === null) return ''
            return `${ctx.dataset.label}: ¥${ctx.parsed.y.toLocaleString()}`
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: any) => `¥${(value / 10000).toFixed(0)}万`,
        },
      },
    },
  }), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">年間データを集計中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>データの取得に失敗しました: {error}</p>
      </div>
    )
  }

  if (annualData.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>売上データがありません</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="年間分析" description="年間売上推移と月次比較" />

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-none border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Banknote className="w-3.5 h-3.5" />
              <span>{currentYearData?.year}年 売上</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">
              ¥{(currentYearData?.totalRevenue || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {currentYearData?.growthRate !== null && currentYearData?.growthRate !== undefined && currentYearData.growthRate >= 0
                ? <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                : <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              }
              <span>前年比</span>
            </div>
            <div className={`text-lg sm:text-xl font-bold ${
              currentYearData?.growthRate !== null && currentYearData?.growthRate !== undefined
                ? currentYearData.growthRate >= 0 ? 'text-green-600' : 'text-red-500'
                : ''
            }`}>
              {currentYearData?.growthRate !== null && currentYearData?.growthRate !== undefined
                ? `${currentYearData.growthRate >= 0 ? '+' : ''}${currentYearData.growthRate.toFixed(1)}%`
                : '—'
              }
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{currentYearData?.year}年 公演数</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">
              {currentYearData?.totalEvents || 0}回
            </div>
            {lastYearData && (
              <div className="text-xs text-muted-foreground mt-0.5">
                前年: {lastYearData.totalEvents}回
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Banknote className="w-3.5 h-3.5" />
              <span>月平均売上</span>
            </div>
            <div className="text-lg sm:text-xl font-bold">
              {(() => {
                const now = new Date()
                const months = currentYearData?.year === now.getFullYear()
                  ? now.getMonth() + 1
                  : 12
                const avg = (currentYearData?.totalRevenue || 0) / months
                return `¥${Math.round(avg).toLocaleString()}`
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 年間売上棒グラフ */}
      {barChartData && (
        <Card className="shadow-none border">
          <CardHeader className="p-3 sm:p-4">
            <CardTitle className="text-base">年間売上推移</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <div className="h-56 sm:h-72 md:h-80">
              <Bar data={barChartData} options={barChartOptions} />
            </div>
            {/* 成長率テーブル */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">年</th>
                    <th className="text-right py-2 px-2 font-medium">売上</th>
                    <th className="text-right py-2 px-2 font-medium">公演数</th>
                    <th className="text-right py-2 pl-2 font-medium">前年比</th>
                  </tr>
                </thead>
                <tbody>
                  {annualData.map(d => (
                    <tr key={d.year} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{d.year}年</td>
                      <td className="text-right py-2 px-2">¥{d.totalRevenue.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">{d.totalEvents}回</td>
                      <td className={`text-right py-2 pl-2 font-medium ${
                        d.growthRate === null ? '' : d.growthRate >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {d.growthRate !== null
                          ? `${d.growthRate >= 0 ? '+' : ''}${d.growthRate.toFixed(1)}%`
                          : '—'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 月次推移折れ線グラフ（年比較） */}
      {lineChartData && (
        <Card className="shadow-none border">
          <CardHeader className="p-3 sm:p-4">
            <CardTitle className="text-base">月次売上比較</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            <div className="h-64 sm:h-80 md:h-96">
              <Line data={lineChartData} options={lineChartOptions} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
