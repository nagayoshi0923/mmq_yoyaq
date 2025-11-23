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
    <div className="space-y-2 sm:space-y-3 md:space-y-4 lg:space-y-6">
      {/* 第1行: 最重要指標（特大表示） */}
      <div className="grid gap-2 sm:gap-2 md:gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs text-blue-900">総売上</CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-blue-600 flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-lg sm:text-base md:text-lg lg:text-lg text-blue-900 leading-tight">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="text-xs text-blue-700 mt-0.5 sm:mt-1 leading-tight">
              {totalEvents}公演<span className="hidden sm:inline"> • </span><br className="sm:hidden" />平均 {formatCurrency(averageRevenue)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs text-red-900">支出合計</CardTitle>
            <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-red-600 flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-lg sm:text-base md:text-lg lg:text-lg text-red-900 leading-tight">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-red-700 mt-0.5 sm:mt-1 leading-tight break-words">
              変動費 {formatCurrency(totalVariableCost)}<span className="hidden sm:inline"> + </span><br className="sm:hidden" />固定費 {formatCurrency(totalFixedCost)}
            </p>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br border-2 ${netProfit >= 0 ? 'from-green-50 to-green-100 border-green-300' : 'from-gray-50 to-gray-100 border-gray-300'} sm:col-span-2 md:col-span-1`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className={`text-xs font-semibold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'}`}>純利益</CardTitle>
            <DollarSign className={`h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 ${netProfit >= 0 ? 'text-green-600' : 'text-gray-600'} flex-shrink-0`} />
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className={`text-lg sm:text-base md:text-lg lg:text-lg font-bold ${netProfit >= 0 ? 'text-green-900' : 'text-gray-900'} leading-tight`}>
              {formatCurrency(netProfit)}
            </div>
            <p className={`text-xs mt-0.5 sm:mt-1 ${netProfit >= 0 ? 'text-green-700' : 'text-gray-700'} leading-tight`}>
              利益率 {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 第2行: 変動費内訳 */}
      <div className="grid gap-2 sm:gap-2 md:gap-3 lg:gap-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs flex items-center gap-1">
              <CreditCard className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 text-orange-600 flex-shrink-0" />
              <span className="truncate">変動費</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-sm sm:text-base md:text-lg lg:text-base text-orange-600 mb-1 sm:mb-2 leading-tight">
              {formatCurrency(totalVariableCost)}
            </div>
            <div className="text-xs space-y-0.5 sm:space-y-1">
              {variableCostBreakdown.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-0.5 border-b border-gray-100 last:border-0">
                  <span className="text-muted-foreground truncate text-xs">{item.category}</span>
                  <span className="flex-shrink-0 ml-1 text-xs">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs flex items-center gap-1">
              <BookOpen className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 text-red-600 flex-shrink-0" />
              <span className="truncate">ライセンス</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-sm sm:text-base md:text-lg lg:text-base text-red-600 leading-tight">
              {formatCurrency(totalLicenseCost)}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 leading-tight">
              作者への支払い
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs flex items-center gap-1">
              <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 text-orange-600 flex-shrink-0" />
              <span className="truncate">制作費</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-sm sm:text-base md:text-lg lg:text-base text-orange-600 mb-1 leading-tight">
              {formatCurrency(totalProductionCost + totalPropsCost)}
            </div>
            {(productionCostBreakdown.length > 0 || propsCostBreakdown.length > 0) && (
              <div className="text-xs text-muted-foreground space-y-0.5 max-h-16 sm:max-h-20 md:max-h-24 overflow-y-auto">
                {productionCostBreakdown.map((item, index) => (
                  <div key={`prod-${index}`} className="flex justify-between gap-1 py-0.5">
                    <span className="truncate text-xs">{item.scenario} / {item.item}</span>
                    <span className="whitespace-nowrap flex-shrink-0 text-xs">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
                {propsCostBreakdown.map((item, index) => (
                  <div key={`prop-${index}`} className="flex justify-between gap-1 py-0.5">
                    <span className="truncate text-xs">{item.scenario} / {item.item}</span>
                    <span className="whitespace-nowrap flex-shrink-0 text-xs">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {productionCostBreakdown.length === 0 && propsCostBreakdown.length === 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 leading-tight">
                制作費なし
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-3 md:p-4 lg:p-6">
            <CardTitle className="text-xs flex items-center gap-1">
              <Store className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-4 md:w-4 text-purple-600 flex-shrink-0" />
              <span className="truncate">固定費</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-3 md:p-4 lg:p-6 pt-0">
            <div className="text-sm sm:text-base md:text-lg lg:text-base text-purple-600 leading-tight">
              {formatCurrency(totalFixedCost)}
            </div>
            {fixedCostBreakdown.length > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5 sm:mt-1 space-y-0.5 max-h-12 overflow-y-auto">
                {(() => {
                  // 項目ごとに合計を計算
                  const itemTotals = fixedCostBreakdown.reduce((acc, item) => {
                    acc[item.item] = (acc[item.item] || 0) + item.amount
                    return acc
                  }, {} as Record<string, number>)
                  
                  return Object.entries(itemTotals).map(([item, total], index) => (
                    <div key={index} className="flex justify-between gap-1">
                      <span className="truncate text-xs">{item}:</span>
                      <span className="flex-shrink-0 text-xs">{formatCurrency(total)}</span>
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

