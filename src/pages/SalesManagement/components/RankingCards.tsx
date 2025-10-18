import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RankingItem {
  id: string
  name?: string
  title?: string
  revenue: number
  events: number
  averageRevenue: number
}

interface RankingCardsProps {
  storeRanking: RankingItem[]
  scenarioRanking: RankingItem[]
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

const RankingCardsBase: React.FC<RankingCardsProps> = ({
  storeRanking,
  scenarioRanking
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 店舗別売上ランキング */}
      <Card>
        <CardHeader>
          <CardTitle>店舗別売上ランキング</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {storeRanking.slice(0, 3).map((store, index) => (
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
            {scenarioRanking.slice(0, 3).map((scenario, index) => (
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
  )
}

// React.memoでメモ化してエクスポート
export const RankingCards = React.memo(RankingCardsBase)

