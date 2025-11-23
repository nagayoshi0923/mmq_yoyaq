import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Line } from 'react-chartjs-2'

interface SalesChartProps {
  chartData: any
  chartOptions: any
  chartRef?: any
}

const SalesChartBase: React.FC<SalesChartProps> = ({
  chartData,
  chartOptions,
  chartRef
}) => {
  return (
    <Card>
      <CardHeader className="p-2 sm:p-3 md:p-4 lg:p-6">
        <CardTitle className="text-base">売上推移</CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="h-48 sm:h-64 md:h-80 lg:h-96">
          <Line 
            data={chartData || { labels: [], datasets: [] }} 
            options={chartOptions} 
            ref={chartRef} 
          />
        </div>
      </CardContent>
    </Card>
  )
}

// React.memoでメモ化してエクスポート（Chart.jsは再レンダーコストが高いため）
export const SalesChart = React.memo(SalesChartBase)

