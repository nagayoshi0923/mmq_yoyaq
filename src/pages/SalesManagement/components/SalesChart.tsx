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
      <CardHeader className="p-3 sm:p-4 md:p-6">
        <CardTitle className="text-base sm:text-lg md:text-xl">売上推移</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="h-64 sm:h-80 md:h-96">
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

