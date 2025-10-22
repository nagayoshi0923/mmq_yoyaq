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
  netProfit
}) => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総売上</CardTitle>
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatCurrency(totalRevenue)}
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
            {formatCurrency(averageRevenue)}
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
            {totalEvents}
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
            {storeCount}
          </div>
          <p className="text-xs text-muted-foreground">
            登録店舗数
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">ライセンス費用</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            -{formatCurrency(totalLicenseCost)}
          </div>
          <p className="text-xs text-muted-foreground">
            作者への支払い
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">GM給与</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            -{formatCurrency(totalGmCost)}
          </div>
          <p className="text-xs text-muted-foreground">
            GMスタッフへの支払い
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">純利益</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(netProfit)}
          </div>
          <p className="text-xs text-muted-foreground">
            売上 - 費用
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// React.memoでメモ化してエクスポート
export const SummaryCards = React.memo(SummaryCardsBase)

