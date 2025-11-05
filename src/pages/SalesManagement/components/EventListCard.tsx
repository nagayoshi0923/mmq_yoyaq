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
        <CardHeader className="p-3 sm:p-4 md:p-6">
          <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            実施公演リスト
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
            データを読み込んでいます...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="p-3 sm:p-4 md:p-6">
          <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            実施公演リスト
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 md:p-6">
          <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
            公演データがありません
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="p-3 sm:p-4 md:p-6">
        <CardTitle className="text-base sm:text-lg md:text-xl flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          実施公演リスト
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="space-y-2 sm:space-y-3">
          {events.map((event) => (
            <div key={event.id} className="border rounded-lg p-2 sm:p-3 hover:bg-gray-50 transition-colors min-h-[60px] sm:min-h-[64px] flex items-center">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-2 sm:gap-4">
                <div className="flex items-start sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] sm:text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {/* カテゴリバッジ */}
                    {event.category === 'gmtest' && (
                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                        GMテスト
                      </Badge>
                    )}
                    {event.category === 'private' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-purple-100 text-purple-700 border-purple-200">
                        貸切
                      </Badge>
                    )}
                    {event.category === 'open' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-green-100 text-green-700 border-green-200">
                        公開
                      </Badge>
                    )}
                    {event.category === 'enterprise' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-blue-100 text-blue-700 border-blue-200">
                        企業
                      </Badge>
                    )}
                    {event.category === 'testplay' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-orange-100 text-orange-700 border-orange-200">
                        テストプレイ
                      </Badge>
                    )}
                    {event.category === 'offsite' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-700 border-yellow-200">
                        出張
                      </Badge>
                    )}
                    {event.category === 'venue_rental' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-gray-100 text-gray-700 border-gray-200">
                        会場貸切
                      </Badge>
                    )}
                    {event.category === 'venue_rental_free' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-gray-100 text-gray-700 border-gray-200">
                        会場貸切（無料）
                      </Badge>
                    )}
                    {event.category === 'package' && (
                      <Badge variant="default" className="text-[10px] sm:text-xs bg-pink-100 text-pink-700 border-pink-200">
                        パッケージ
                      </Badge>
                    )}
                    {/* デモ参加者バッジ */}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs bg-sky-50 text-sky-700 border-sky-200">
                        デモ参加者
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <h3 
                        className="font-semibold text-xs sm:text-sm truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onEditEvent?.(event)}
                        title="クリックして編集"
                      >
                        {event.scenario_title}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 sm:h-6 sm:w-6 p-0 flex-shrink-0"
                        onClick={() => onEditEvent?.(event)}
                        title="編集"
                      >
                        <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="truncate">{event.store_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        {event.participant_count}名
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4 md:gap-6 text-right overflow-x-auto">
                  <div className="text-center min-w-[60px] sm:min-w-[70px] md:min-w-[80px] flex-shrink-0">
                    <div className="text-[10px] sm:text-xs text-muted-foreground">売上</div>
                    <div className="font-bold text-green-600 text-xs sm:text-sm">
                      {formatCurrency(event.revenue)}
                    </div>
                  </div>

                  <div className="text-center min-w-[60px] sm:min-w-[70px] md:min-w-[80px] flex-shrink-0 hidden sm:block">
                    <div className="text-xs text-muted-foreground">ライセンス</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.license_cost)}
                    </div>
                  </div>

                  <div className="text-center min-w-[60px] sm:min-w-[70px] md:min-w-[80px] flex-shrink-0 hidden md:block">
                    <div className="text-xs text-muted-foreground">GM給与</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.gm_cost)}
                    </div>
                  </div>

                  <div className="text-center min-w-[60px] sm:min-w-[70px] md:min-w-[80px] flex-shrink-0">
                    <div className="text-[10px] sm:text-xs text-muted-foreground">純利益</div>
                    <div className={`font-bold ${event.net_profit >= 0 ? 'text-green-600' : 'text-red-600'} text-xs sm:text-sm`}>
                      {formatCurrency(event.net_profit)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 text-center">
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総売上</div>
              <div className="font-bold text-green-600 text-xs sm:text-sm md:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.revenue, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総ライセンス</div>
              <div className="font-bold text-red-600 text-xs sm:text-sm md:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.license_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総GM給与</div>
              <div className="font-bold text-red-600 text-xs sm:text-sm md:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.gm_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総純利益</div>
              <div className={`font-bold ${events.reduce((sum, event) => sum + event.net_profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'} text-xs sm:text-sm md:text-base`}>
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
