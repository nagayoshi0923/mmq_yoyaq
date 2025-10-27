import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, TrendingUp, Store, BookOpen, CreditCard, Users, DollarSign } from 'lucide-react'

interface Store {
  id: string
  name: string
}

interface SummaryCardsProps {
  totalRevenue: number
  averageRevenue: number
  totalEvents: number
  storeCount: number
  totalLicenseCost: number
  totalGmCost: number
  totalFixedCost: number
  fixedCostBreakdown: Array<{
    item: string
    amount: number
    store: string
  }>
  totalVariableCost: number
  variableCostBreakdown: Array<{
    category: string
    amount: number
  }>
  netProfit: number
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

const SummaryCardsBase: React.FC<SummaryCardsProps> = ({
  totalRevenue,
  averageRevenue,
  totalEvents,
  storeCount,
  totalLicenseCost,
  totalGmCost,
  totalFixedCost,
  fixedCostBreakdown,
  totalVariableCost,
  variableCostBreakdown,
  netProfit
}) => {
  // 支出合計を計算
  const totalExpenses = totalVariableCost + totalFixedCost

  return (
    <div className="space-y-6">
      {/* 第1行: 最重要指標（特大表示） */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold text-blue-900">総売上</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-sm text-blue-700 mt-1">
              {totalEvents}公演 • 平均 {formatCurrency(averageRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold text-red-900">支出合計</CardTitle>
            <CreditCard className="h-5 w-5 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-900">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-sm text-red-700 mt-1">
              変動費 {formatCurrency(totalVariableCost)} + 固定費 {formatCurrency(totalFixedCost)}
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br border-2 ${netProfit >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-gray-50 to-gray-100 border-gray-300'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-base font-semibold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'}`}>純利益</CardTitle>
            <DollarSign className={`h-5 w-5 ${netProfit >= 0 ? 'text-green-600' : 'text-gray-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className={`text-sm mt-1 ${netProfit >= 0 ? 'text-green-700' : 'text-gray-700'}`}>
              利益率 {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 第2行: 変動費内訳 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-600" />
              変動費
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-orange-600 mb-3">
              {formatCurrency(totalVariableCost)}
            </div>
            <div className="text-xs space-y-1.5">
              {variableCostBreakdown.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                  <span className="text-muted-foreground">{item.category}</span>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-red-600" />
              ライセンス費用
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              {formatCurrency(totalLicenseCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              作者への支払い
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600" />
              GM給与
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              {formatCurrency(totalGmCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              GMスタッフへの支払い
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Store className="h-4 w-4 text-purple-600" />
              固定費
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-purple-600">
              {formatCurrency(totalFixedCost)}
            </div>
            {fixedCostBreakdown.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2 space-y-0.5 max-h-12 overflow-y-auto">
                {(() => {
                  // 項目ごとに合計を計算
                  const itemTotals = fixedCostBreakdown.reduce((acc, item) => {
                    acc[item.item] = (acc[item.item] || 0) + item.amount
                    return acc
                  }, {} as Record<string, number>)
                  
                  return Object.entries(itemTotals).map(([item, total], index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item}:</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  ))
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// React.memoでメモ化してエクスポート
export const SummaryCards = React.memo(SummaryCardsBase)

