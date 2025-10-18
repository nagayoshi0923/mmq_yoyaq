import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, TrendingUp, Store, BookOpen, Download } from 'lucide-react'
import { Line } from 'react-chartjs-2'
import { SalesData } from '@/types'

interface Store {
  id: string
  name: string
  short_name: string
}

interface SalesOverviewProps {
  salesData: SalesData | null
  stores: Store[]
  loading: boolean
  chartRef: any
  chartData: any
  chartOptions: any
  onExportCSV: () => void
  onExportExcel: () => void
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

export const SalesOverview: React.FC<SalesOverviewProps> = ({
  salesData,
  stores,
  loading,
  chartRef,
  chartData,
  chartOptions,
  onExportCSV,
  onExportExcel
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">売上管理</h1>
      </div>

      {loading ? (
        <div className="text-center py-8">読み込み中...</div>
      ) : (
        <>
          {/* サマリーカード */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総売上</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(salesData?.totalRevenue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  期間内の総売上
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均売上</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(salesData?.averageRevenuePerEvent || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  1公演あたり
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総公演数</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {salesData?.totalEvents || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  期間内の公演数
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">店舗数</CardTitle>
                <Store className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stores.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  登録店舗数
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ランキング表示（2カラム） */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 店舗別売上ランキング */}
            <Card>
              <CardHeader>
                <CardTitle>店舗別売上ランキング</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData?.storeRanking?.slice(0, 3).map((store, index) => (
                    <div key={store.id || `store-${index}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{store.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {store.events}回の公演
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(store.revenue)}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(store.averageRevenue)}/回
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* シナリオ別売上ランキング */}
            <Card>
              <CardHeader>
                <CardTitle>シナリオ別売上ランキング</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData?.scenarioRanking?.slice(0, 3).map((scenario, index) => (
                    <div key={scenario.id || `scenario-${index}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{scenario.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {scenario.events}回の公演
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(scenario.revenue)}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatCurrency(scenario.averageRevenue)}/回
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 売上推移グラフ */}
          <Card>
            <CardHeader>
              <CardTitle>売上推移</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <Line data={chartData || { labels: [], datasets: [] }} options={chartOptions} ref={chartRef} />
              </div>
            </CardContent>
          </Card>

          {/* データエクスポート */}
          <Card>
            <CardHeader>
              <CardTitle>データエクスポート</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button onClick={onExportCSV} disabled={loading}>
                  <Download className="mr-2 h-4 w-4" />
                  CSVエクスポート
                </Button>
                <Button onClick={onExportExcel} disabled={loading}>
                  <Download className="mr-2 h-4 w-4" />
                  Excelエクスポート
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

