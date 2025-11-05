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
  totalProductionCost: number
  totalPropsCost: number
  totalFixedCost: number
  fixedCostBreakdown: Array<{
    item: string
    amount: number
    store: string
  }>
  productionCostBreakdown: Array<{
    item: string
    amount: number
    scenario: string
  }>
  propsCostBreakdown: Array<{
    item: string
    amount: number
    scenario: string
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
  totalProductionCost,
  totalPropsCost,
  totalFixedCost,
  fixedCostBreakdown,
  productionCostBreakdown,
  propsCostBreakdown,
  totalVariableCost,
  variableCostBreakdown,
  netProfit
}) => {
  // 支出合計を計算
  const totalExpenses = totalVariableCost + totalFixedCost

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* 第1行: 最重要指標（特大表示） */}
      <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm md:text-base font-semibold text-blue-900">総売上</CardTitle>
            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-900">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs sm:text-sm text-blue-700 mt-1">
              {totalEvents}公演 • 平均 {formatCurrency(averageRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm md:text-base font-semibold text-red-900">支出合計</CardTitle>
            <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-red-900">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs sm:text-sm text-red-700 mt-1 break-words">
              変動費 {formatCurrency(totalVariableCost)}<span className="hidden sm:inline"> + </span><br className="sm:hidden" />固定費 {formatCurrency(totalFixedCost)}
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br border-2 ${netProfit >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-gray-50 to-gray-100 border-gray-300'} sm:col-span-2 md:col-span-1`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-4 md:p-6">
            <CardTitle className={`text-xs sm:text-sm md:text-base font-semibold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'}`}>純利益</CardTitle>
            <DollarSign className={`h-4 w-4 sm:h-5 sm:w-5 ${netProfit >= 0 ? 'text-green-600' : 'text-gray-600'}`} />
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'}`}>
              {formatCurrency(netProfit)}
            </div>
            <p className={`text-xs sm:text-sm mt-1 ${netProfit >= 0 ? 'text-green-700' : 'text-gray-700'}`}>
              利益率 {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 第2行: 変動費内訳 */}
      <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
              変動費
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-lg sm:text-xl font-bold text-orange-600 mb-2 sm:mb-3">
              {formatCurrency(totalVariableCost)}
            </div>
            <div className="text-[10px] sm:text-xs space-y-1 sm:space-y-1.5">
              {variableCostBreakdown.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-0.5 sm:py-1 border-b border-gray-100 last:border-0">
                  <span className="text-muted-foreground truncate">{item.category}</span>
                  <span className="font-medium flex-shrink-0 ml-2">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 text-red-600" />
              ライセンス費用
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-lg sm:text-xl font-bold text-red-600">
              {formatCurrency(totalLicenseCost)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
              作者への支払い
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-orange-600" />
              制作費・物品購入
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-lg sm:text-xl font-bold text-orange-600 mb-1 sm:mb-2">
              {formatCurrency(totalProductionCost + totalPropsCost)}
            </div>
            {(productionCostBreakdown.length > 0 || propsCostBreakdown.length > 0) && (
              <div className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 max-h-20 sm:max-h-24 overflow-y-auto">
                {productionCostBreakdown.map((item, index) => (
                  <div key={`prod-${index}`} className="flex justify-between gap-1 sm:gap-2 py-0.5">
                    <span className="truncate">{item.scenario} / {item.item}</span>
                    <span className="whitespace-nowrap font-medium flex-shrink-0">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                {propsCostBreakdown.map((item, index) => (
                  <div key={`prop-${index}`} className="flex justify-between gap-1 sm:gap-2 py-0.5">
                    <span className="truncate">{item.scenario} / {item.item}</span>
                    <span className="whitespace-nowrap font-medium flex-shrink-0">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {productionCostBreakdown.length === 0 && propsCostBreakdown.length === 0 && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2">
                制作費・物品購入なし
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-4 md:p-6">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1 sm:gap-2">
              <Store className="h-3 w-3 sm:h-4 sm:w-4 text-purple-600" />
              固定費
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
            <div className="text-lg sm:text-xl font-bold text-purple-600">
              {formatCurrency(totalFixedCost)}
            </div>
            {fixedCostBreakdown.length > 0 && (
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 space-y-0.5 max-h-12 overflow-y-auto">
                {(() => {
                  // 項目ごとに合計を計算
                  const itemTotals = fixedCostBreakdown.reduce((acc, item) => {
                    acc[item.item] = (acc[item.item] || 0) + item.amount
                    return acc
                  }, {} as Record<string, number>)
                  
                  return Object.entries(itemTotals).map(([item, total], index) => (
                    <div key={index} className="flex justify-between gap-1 sm:gap-2">
                      <span className="truncate">{item}:</span>
                      <span className="font-medium flex-shrink-0">{formatCurrency(total)}</span>
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

