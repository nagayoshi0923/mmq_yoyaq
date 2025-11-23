import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, Users, Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  has_demo_participant?: boolean
}

interface EventListCardProps {
  events: EventItem[]
  loading?: boolean
  onEditEvent?: (event: EventItem) => void
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(amount)

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

const CATEGORY_STYLES: Record<
  NonNullable<EventItem['category']>,
  { label: string; className: string }
> = {
  gmtest: { label: 'GMテスト', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  private: { label: '貸切', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  open: { label: '公開', className: 'bg-green-100 text-green-700 border-green-200' },
  enterprise: { label: '企業', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  testplay: { label: 'テストプレイ', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  offsite: { label: '出張', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  venue_rental: { label: '会場貸切', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  venue_rental_free: { label: '会場貸切（無料）', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  package: { label: 'パッケージ', className: 'bg-pink-100 text-pink-700 border-pink-200' }
}

const SectionHeader: React.FC<{ subtitle?: string }> = ({ subtitle }) => (
  <div className="flex items-center gap-2">
    <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
    <h2 className="text-base sm:text-lg md:text-base">実施公演リスト</h2>
    {subtitle && <span className="text-xs text-muted-foreground">({subtitle})</span>}
  </div>
)

const EventListCardBase: React.FC<EventListCardProps> = ({ events, loading = false, onEditEvent }) => {
  if (loading) {
    return (
      <section className="space-y-3 sm:space-y-4">
        <SectionHeader />
        <p className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">
          データを読み込んでいます...
        </p>
      </section>
    )
  }

  if (events.length === 0) {
    return (
      <section className="space-y-3 sm:space-y-4">
        <SectionHeader />
        <p className="text-center py-6 sm:py-8 text-muted-foreground text-xs sm:text-sm">公演データがありません</p>
      </section>
    )
  }

  const totals = events.reduce(
    (acc, event) => ({
      revenue: acc.revenue + event.revenue,
      license: acc.license + event.license_cost,
      gm: acc.gm + event.gm_cost,
      profit: acc.profit + event.net_profit
    }),
    { revenue: 0, license: 0, gm: 0, profit: 0 }
  )

  return (
    <section className="space-y-3 sm:space-y-4">
      <SectionHeader subtitle={`${events.length}件`} />

      <div className="space-y-2 sm:space-y-3">
        {events.map((event) => {
          const category = event.category ? CATEGORY_STYLES[event.category] : undefined

          return (
            <article
              key={event.id}
              className="border rounded-lg p-2 sm:p-3 hover:bg-muted/40 transition-colors space-y-2 sm:space-y-0"
            >
              {/* モバイル表示 */}
              <div className="flex flex-col gap-2 sm:hidden">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {category && (
                      <Badge variant="default" className={`text-xs ${category.className}`}>
                        {category.label}
                      </Badge>
                    )}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">
                        デモ参加者
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => onEditEvent?.(event)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>

                <button
                  type="button"
                  className="text-left text-sm truncate hover:text-primary transition-colors"
                  onClick={() => onEditEvent?.(event)}
                >
                  {event.scenario_title}
                </button>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.store_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {event.participant_count}名
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t pt-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">売上</p>
                    <p className="text-green-600">{formatCurrency(event.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">純利益</p>
                    <p className={`font-bold ${event.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(event.net_profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ライセンス</p>
                    <p className="text-red-600">{formatCurrency(event.license_cost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">GM給与</p>
                    <p className="text-red-600">{formatCurrency(event.gm_cost)}</p>
                  </div>
                </div>
              </div>

              {/* デスクトップ表示 */}
              <div className="hidden sm:flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {formatDate(event.date)}
                    </Badge>
                    {category && (
                      <Badge variant="default" className={`text-xs ${category.className}`}>
                        {category.label}
                      </Badge>
                    )}
                    {event.has_demo_participant && (
                      <Badge variant="outline" className="text-xs bg-sky-50 text-sky-700 border-sky-200">
                        デモ参加者
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-left text-sm truncate hover:text-primary transition-colors"
                        onClick={() => onEditEvent?.(event)}
                      >
                        {event.scenario_title}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={() => onEditEvent?.(event)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.store_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {event.participant_count}名
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-right text-sm">
                  <div className="min-w-[80px]">
                    <p className="text-xs text-muted-foreground">売上</p>
                    <p className="text-green-600">{formatCurrency(event.revenue)}</p>
                  </div>
                  <div className="min-w-[80px]">
                    <p className="text-xs text-muted-foreground">ライセンス</p>
                    <p className="text-red-600">{formatCurrency(event.license_cost)}</p>
                  </div>
                  <div className="min-w-[80px]">
                    <p className="text-xs text-muted-foreground">GM給与</p>
                    <p className="text-red-600">{formatCurrency(event.gm_cost)}</p>
                  </div>
                  <div className="min-w-[80px]">
                    <p className="text-xs text-muted-foreground">純利益</p>
                    <p className={`font-bold ${event.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(event.net_profit)}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <footer className="border-t pt-3 sm:pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 text-center text-sm">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">総売上</p>
            <p className="text-green-600">{formatCurrency(totals.revenue)}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">総ライセンス</p>
            <p className="text-red-600">{formatCurrency(totals.license)}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">総GM給与</p>
            <p className="text-red-600">{formatCurrency(totals.gm)}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground">総純利益</p>
            <p className={`font-bold ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totals.profit)}
            </p>
          </div>
        </div>
      </footer>
    </section>
  )
}

export const EventListCard = React.memo(EventListCardBase)
