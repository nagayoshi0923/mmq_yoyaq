import React from 'react'
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
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          <h2 className="text-base sm:text-lg md:text-xl font-semibold">実施公演リスト</h2>
        </div>
        <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
          データを読み込んでいます...
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          <h2 className="text-base sm:text-lg md:text-xl font-semibold">実施公演リスト</h2>
        </div>
        <div className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
          公演データがありません
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
        <h2 className="text-base sm:text-lg md:text-xl font-semibold">実施公演リスト</h2>
      </div>
      <div className="space-y-2 sm:space-y-3">
          {events.map((event) => (
            <div key={event.id} className="border rounded-lg p-2 sm:p-3 hover:bg-gray-50 transition-colors">
              {/* モバイルレイアウト: 縦並び */}
              <div className="flex flex-col sm:hidden gap-2">
                {/* ヘッダー: 日付、バッジ、編集ボタン */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap flex-1">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {/* カテゴリバッジ */}
                    {event.category === 'gmtest' && (
                      <Badge variant="secondary" className="text-xs">GMテスト</Badge>
                    )}
                    {event.category === 'private' && (
                      <Badge variant="default" className="text-xs bg-purple-100 text-purple-700 border-purple-200">貸切</Badge>
                    )}
                    {event.category === 'open' && (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">公開</Badge>
                    )}
                    {event.category === 'enterprise' && (
                      <Badge variant="default" className="text-xs bg-blue-100 text-blue-700 border-blue-200">企業</Badge>
                    )}
                    {event.category === 'testplay' && (
                      <Badge variant="default" className="text-xs bg-orange-100 text-orange-700 border-orange-200">テストプレイ</Badge>
                    )}
                    {event.category === 'offsite' && (
                      <Badge variant="default" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">出張</Badge>
                    )}
                    {event.category === 'venue_rental' && (
                      <Badge variant="default" className="text-xs bg-gray-100 text-gray-700 border-gray-200">会場貸切</Badge>
                    )}
                    {event.category === 'venue_rental_free' && (
                      <Badge variant="default" className="text-xs bg-gray-100 text-gray-700 border-gray-200">会場貸切（無料）</Badge>
                    )}
                    {event.category === 'package' && (
                      <Badge variant="default" className="text-xs bg-pink-100 text-pink-700 border-pink-200">パッケージ</Badge>
                    )}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">デモ参加者</Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={() => onEditEvent?.(event)}
                    title="編集"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>

                {/* シナリオタイトル */}
                <h3 
                  className="font-semibold text-sm truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={() => onEditEvent?.(event)}
                  title="クリックして編集"
                >
                  {event.scenario_title}
                </h3>

                {/* 店舗・参加者情報 */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{event.store_name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{event.participant_count}名</span>
                  </div>
                </div>

                {/* 金額情報: グリッドレイアウト */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">売上</div>
                    <div className="font-bold text-green-600 text-sm">
                      {formatCurrency(event.revenue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">純利益</div>
                    <div className={`font-bold ${event.net_profit >= 0 ? 'text-green-600' : 'text-red-600'} text-sm`}>
                      {formatCurrency(event.net_profit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">ライセンス</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.license_cost)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">GM給与</div>
                    <div className="font-bold text-red-600 text-sm">
                      {formatCurrency(event.gm_cost)}
                    </div>
                  </div>
                </div>
              </div>

              {/* デスクトップレイアウト: 横並び */}
              <div className="hidden sm:flex items-center justify-between w-full gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {/* カテゴリバッジ */}
                    {event.category === 'gmtest' && (
                      <Badge variant="secondary" className="text-xs">GMテスト</Badge>
                    )}
                    {event.category === 'private' && (
                      <Badge variant="default" className="text-xs bg-purple-100 text-purple-700 border-purple-200">貸切</Badge>
                    )}
                    {event.category === 'open' && (
                      <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-green-200">公開</Badge>
                    )}
                    {event.category === 'enterprise' && (
                      <Badge variant="default" className="text-xs bg-blue-100 text-blue-700 border-blue-200">企業</Badge>
                    )}
                    {event.category === 'testplay' && (
                      <Badge variant="default" className="text-xs bg-orange-100 text-orange-700 border-orange-200">テストプレイ</Badge>
                    )}
                    {event.category === 'offsite' && (
                      <Badge variant="default" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">出張</Badge>
                    )}
                    {event.category === 'venue_rental' && (
                      <Badge variant="default" className="text-xs bg-gray-100 text-gray-700 border-gray-200">会場貸切</Badge>
                    )}
                    {event.category === 'venue_rental_free' && (
                      <Badge variant="default" className="text-xs bg-gray-100 text-gray-700 border-gray-200">会場貸切（無料）</Badge>
                    )}
                    {event.category === 'package' && (
                      <Badge variant="default" className="text-xs bg-pink-100 text-pink-700 border-pink-200">パッケージ</Badge>
                    )}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">デモ参加者</Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
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
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => onEditEvent?.(event)}
                        title="編集"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{event.store_name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{event.participant_count}名</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right flex-shrink-0">
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

        <div className="mt-3 sm:mt-4 md:mt-6 pt-3 sm:pt-4 border-t">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 text-center">
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総売上</div>
              <div className="font-bold text-green-600 text-sm sm:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.revenue, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総ライセンス</div>
              <div className="font-bold text-red-600 text-sm sm:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.license_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総GM給与</div>
              <div className="font-bold text-red-600 text-sm sm:text-base">
                {formatCurrency(events.reduce((sum, event) => sum + event.gm_cost, 0))}
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm text-muted-foreground">総純利益</div>
              <div className={`font-bold ${events.reduce((sum, event) => sum + event.net_profit, 0) >= 0 ? 'text-green-600' : 'text-red-600'} text-sm sm:text-base`}>
                {formatCurrency(events.reduce((sum, event) => sum + event.net_profit, 0))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// React.memoでメモ化してエクスポート
export const EventListCard = React.memo(EventListCardBase)
