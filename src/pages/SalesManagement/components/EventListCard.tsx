import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, DollarSign, CreditCard, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Edit } from 'lucide-react'

interface EventItem {
  id: string
  date: string
  store_name: string
  scenario_title: string
  revenue: number
  license_cost: number
  gm_cost: number
  net_profit: number
  participant_count: number
  category?: string
  has_demo_participant?: boolean // デモ参加者がいるかどうか
}

interface EventListCardProps {
  events: EventItem[]
  loading?: boolean
  onEditEvent?: (event: EventItem) => void
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

const EventListCardBase: React.FC<EventListCardProps> = ({
  events,
  loading = false,
  onEditEvent
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>実施公演リスト</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            データを読み込んでいます...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>実施公演リスト</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            公演データがありません
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          実施公演リスト
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="border rounded-lg p-3 hover:bg-gray-50 transition-colors h-16 flex items-center">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {event.category === 'gmtest' && (
                      <Badge variant="secondary" className="text-xs">
                        GMテスト
                      </Badge>
                    )}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        デモ参加者
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 
                        className="font-semibold text-sm truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onEditEvent?.(event)}
                        title="クリックして編集"
                      >
                        {event.scenario_title}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => onEditEvent?.(event)}
                        title="編集"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.store_name}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {event.participant_count}名
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right">
                  <div className="text-center min-w-[80px]">
                    <div className="text-xs text-muted-foreground">売上</div>
                    <div className="font-bold text-green-600 text-sm">
                      {formatCurrency(event.revenue)}
                    </div>
                  </div>

                  <div className="text-center min-w-[80px]">
                    <div className="text-xs text-muted-foreground">ライセンス</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.license_cost)}
                    </div>
                  </div>

                  <div className="text-center min-w-[80px]">
                    <div className="text-xs text-muted-foreground">GM給与</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.gm_cost)}
                    </div>
                  </div>

                  <div className="text-center min-w-[80px]">
                    <div className="text-xs text-muted-foreground">純利益</div>
                    <div className={`font-bold ${event.net_profit >= 0 ? 'text-green-600' : 'text-red-600'} text-sm`}>
                      {formatCurrency(event.net_profit)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-sm text-muted-foreground">総売上</div>
              <div className="font-bold text-green-600">
                {formatCurrency(events.reduce((sum, event) => sum + event.revenue, 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">総ライセンス</div>
              <div className="font-bold text-red-600">
                {formatCurrency(events.reduce((sum, event) => sum + event.license_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">総GM給与</div>
              <div className="font-bold text-red-600">
                {formatCurrency(events.reduce((sum, event) => sum + event.gm_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">総純利益</div>
              <div className={`font-bold ${events.reduce((sum, event) => sum + event.net_profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(events.reduce((sum, event) => sum + event.net_profit, 0))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// React.memoでメモ化してエクスポート
export const EventListCard = React.memo(EventListCardBase)
