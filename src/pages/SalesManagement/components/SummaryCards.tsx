import React from 'react'
import { TrendingUp, Store, BookOpen, CreditCard, Users, DollarSign, Wrench, Plus } from 'lucide-react'
import { StatCard } from '@/components/patterns/stat'
import { devDb } from '@/components/ui/DevField'
import { formatJstYmd } from '@/utils/jstDate'

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
  totalFcCost: number
  totalFixedCost: number
  fixedCostBreakdown: Array<{
    item: string
    amount: number
    store: string
  }>
  productionCostBreakdown: Array<{
    id?: string
    item: string
    amount: number
    scenario: string
    date?: string
    store_id?: string | null
    scenario_id?: string | null
    isEditable?: boolean
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
  // F-1: 調整収入（総売上のうち調整由来分）。0 のときは sub に何も出さない
  totalAdjustmentIncome?: number
  // F-1: 調整支出合計（制作費・調整カードの費用計上分に含める）
  totalAdjustmentExpense?: number
  // F-1: 収支調整エントリ（制作費・調整カードのリストに合流表示する）
  adjustmentEntries?: Array<{
    id: string
    date: string
    type: 'income' | 'expense'
    amount: number
    category: string
    description?: string | null
    schedule_event_id?: string | null
    store_id?: string | null
  }>
  netProfit: number
  // 制作費・調整カードクリック時（追加）のコールバック（オプション）
  onProductionCostClick?: () => void
  // 制作費項目編集時のコールバック
  onProductionCostEdit?: (item: {
    id: string
    date: string
    category: string
    amount: number
    store_id?: string | null
    scenario_id?: string | null
  }) => void
  // 収支調整エントリ編集時のコールバック
  onAdjustmentEdit?: (entry: {
    id: string
    date: string
    type: 'income' | 'expense'
    amount: number
    category: string
    description?: string | null
    schedule_event_id?: string | null
    store_id?: string | null
  }) => void
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
  totalFcCost,
  totalFixedCost,
  fixedCostBreakdown,
  productionCostBreakdown,
  propsCostBreakdown,
  totalVariableCost,
  variableCostBreakdown,
  totalAdjustmentIncome = 0,
  totalAdjustmentExpense = 0,
  adjustmentEntries = [],
  netProfit,
  onProductionCostClick,
  onProductionCostEdit,
  onAdjustmentEdit
}) => {
  // 制作費・調整カードの value（費用計上分の合計）
  // 制作費 + 必要道具 + 調整支出。調整収入は総売上側なのでここには足さない。
  const productionAdjustmentTotal = totalProductionCost + totalPropsCost + totalAdjustmentExpense
  // 支出合計を計算
  const totalExpenses = totalVariableCost + totalFixedCost

  return (
    <div className="space-y-2 sm:space-y-3 md:space-y-4 md:space-y-6">
      {/* 第1行: 最重要指標 */}
      <div className="grid gap-2 sm:gap-2 md:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          label="総売上"
          icon={TrendingUp}
          value={<span {...devDb('reservations.sum(total_amount)')}>{formatCurrency(totalRevenue)}</span>}
          sub={
            <>
              <span {...devDb('schedule_events.count()')}>{totalEvents}公演</span>
              <span className="hidden sm:inline"> • </span>
              <br className="sm:hidden" />
              平均 <span {...devDb('calc:avg(revenue)')}>{formatCurrency(averageRevenue)}</span>
              {totalAdjustmentIncome > 0 && (
                <>
                  <br />
                  うち調整 +{formatCurrency(totalAdjustmentIncome)}
                </>
              )}
            </>
          }
        />

        <StatCard
          label="支出合計"
          icon={CreditCard}
          value={<span {...devDb('calc:total_expenses')}>{formatCurrency(totalExpenses)}</span>}
          sub={
            <span className="break-words">
              変動費 {formatCurrency(totalVariableCost)}
              <span className="hidden sm:inline"> + </span>
              <br className="sm:hidden" />
              固定費 {formatCurrency(totalFixedCost)}
            </span>
          }
        />

        <StatCard
          className="sm:col-span-2 md:col-span-1"
          label="粗利益"
          icon={DollarSign}
          tone={netProfit >= 0 ? 'success' : 'default'}
          value={<span {...devDb('calc:net_profit')}>{formatCurrency(netProfit)}</span>}
          sub={
            <>
              利益率 <span {...devDb('calc:profit_rate')}>{totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0}%</span>
              <br />
              <span className="text-[10px] text-muted-foreground">固定費は月額満額を計上（日割りなし）。当月など期間の途中では粗利が低く表示されます。</span>
            </>
          }
        />
      </div>

      {/* 第2行: 変動費内訳 */}
      <div className="grid gap-2 sm:gap-2 md:gap-3 md:gap-4 grid-cols-2 sm:grid-cols-2 md:grid-cols-5">
        <StatCard
          label="変動費"
          icon={CreditCard}
          value={formatCurrency(totalVariableCost)}
          sub={
            <div className="space-y-0.5 sm:space-y-1">
              {variableCostBreakdown.map((item, index) => (
                <div key={index} className="flex justify-between items-center py-0.5 border-b border-gray-100 last:border-0">
                  <span className="truncate">{item.category}</span>
                  <span className="flex-shrink-0 ml-1">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          }
        />

        <StatCard
          label="GM報酬"
          icon={Users}
          value={formatCurrency(totalGmCost)}
          sub="GMへの支払い"
        />

        <StatCard
          label="FC料金"
          icon={Store}
          value={formatCurrency(totalFcCost)}
          sub="公演ごとのFC料金"
        />

        <StatCard
          label="ライセンス"
          icon={BookOpen}
          value={formatCurrency(totalLicenseCost)}
          sub="作者への支払い"
        />

        <StatCard
          label="制作費・調整"
          icon={onProductionCostClick ? Plus : Wrench}
          onClick={onProductionCostClick}
          value={formatCurrency(productionAdjustmentTotal)}
          sub={
            <>
              {(productionCostBreakdown.length > 0 || propsCostBreakdown.length > 0 || adjustmentEntries.length > 0) && (
                <div className="space-y-0.5 max-h-16 sm:max-h-20 md:max-h-24 overflow-y-auto">
                  {productionCostBreakdown.map((item, index) => (
                    <div
                      key={`prod-${index}`}
                      className={`flex justify-between gap-1 py-0.5 ${item.isEditable && onProductionCostEdit ? 'cursor-pointer hover:bg-orange-100 rounded px-1 -mx-1' : ''}`}
                      onClick={(e) => {
                        if (item.isEditable && item.id && item.date && onProductionCostEdit) {
                          e.stopPropagation()
                          onProductionCostEdit({
                            id: item.id,
                            date: item.date,
                            category: item.item,
                            amount: item.amount,
                            store_id: item.store_id,
                            scenario_id: item.scenario_id
                          })
                        }
                      }}
                    >
                      <span className="truncate">{item.scenario} / {item.item}</span>
                      <span className="whitespace-nowrap flex-shrink-0">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  {propsCostBreakdown.map((item, index) => (
                    <div key={`prop-${index}`} className="flex justify-between gap-1 py-0.5">
                      <span className="truncate">{item.scenario} / {item.item}</span>
                      <span className="whitespace-nowrap flex-shrink-0">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  {adjustmentEntries.map((entry) => {
                    const isIncome = entry.type === 'income'
                    const label = entry.description || entry.category
                    return (
                      <div
                        key={`adj-${entry.id}`}
                        className={`flex justify-between gap-1 py-0.5 ${onAdjustmentEdit ? 'cursor-pointer hover:bg-orange-100 rounded px-1 -mx-1' : ''}`}
                        onClick={(e) => {
                          if (onAdjustmentEdit) {
                            e.stopPropagation()
                            onAdjustmentEdit(entry)
                          }
                        }}
                      >
                        <span className="truncate">{formatJstYmd(entry.date)} {label}</span>
                        <span className={`whitespace-nowrap flex-shrink-0 ${isIncome ? 'text-green-600' : ''}`}>
                          {isIncome ? `+${formatCurrency(entry.amount)}` : formatCurrency(entry.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {productionCostBreakdown.length === 0 && propsCostBreakdown.length === 0 && adjustmentEntries.length === 0 && (
                <span>{onProductionCostClick ? 'クリックして追加' : '制作費なし'}</span>
              )}
              {totalAdjustmentIncome > 0 && (
                <div className="mt-0.5 text-muted-foreground">
                  収入 +{formatCurrency(totalAdjustmentIncome)} は総売上に計上
                </div>
              )}
            </>
          }
        />
      </div>

      {/* 第3行: 固定費 */}
      <div className="grid gap-2 sm:gap-2 md:gap-3 md:gap-4 grid-cols-1">
        <StatCard
          label="固定費"
          icon={Store}
          value={formatCurrency(totalFixedCost)}
          sub={
            fixedCostBreakdown.length > 0 ? (
              <div className="space-y-0.5 max-h-12 overflow-y-auto">
                {(() => {
                  // 項目ごとに合計を計算
                  const itemTotals = fixedCostBreakdown.reduce((acc, item) => {
                    acc[item.item] = (acc[item.item] || 0) + item.amount
                    return acc
                  }, {} as Record<string, number>)

                  return Object.entries(itemTotals).map(([item, total], index) => (
                    <div key={index} className="flex justify-between gap-1">
                      <span className="truncate">{item}:</span>
                      <span className="flex-shrink-0">{formatCurrency(total)}</span>
                    </div>
                  ))
                })()}
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}

// React.memoでメモ化してエクスポート
export const SummaryCards = React.memo(SummaryCardsBase)
