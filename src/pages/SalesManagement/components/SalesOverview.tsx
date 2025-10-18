import React from 'react'
import { SalesData } from '@/types'
import { SummaryCards } from './SummaryCards'
import { RankingCards } from './RankingCards'
import { SalesChart } from './SalesChart'
import { ExportButtons } from './ExportButtons'

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
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">売上管理</h1>
        <div className="text-center py-8">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">売上管理</h1>

      <SummaryCards
        totalRevenue={salesData?.totalRevenue || 0}
        averageRevenue={salesData?.averageRevenuePerEvent || 0}
        totalEvents={salesData?.totalEvents || 0}
        storeCount={stores.length}
      />

      <RankingCards
        storeRanking={salesData?.storeRanking || []}
        scenarioRanking={salesData?.scenarioRanking || []}
      />

      <SalesChart
        chartData={chartData}
        chartOptions={chartOptions}
        chartRef={chartRef}
      />

      <ExportButtons
        onExportCSV={onExportCSV}
        onExportExcel={onExportExcel}
        loading={loading}
      />
    </div>
  )
}

