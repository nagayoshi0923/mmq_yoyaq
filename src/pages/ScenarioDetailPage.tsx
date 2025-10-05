import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ExternalLink, X as XIcon, Star, ArrowLeft } from 'lucide-react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'

interface ScenarioDetail {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  synopsis?: string
  description?: string
  author: string
  genre: string[]
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  has_pre_reading: boolean
  official_site_url?: string
  participation_fee: number
}

interface EventSchedule {
  event_id: string
  date: string
  start_time: string
  end_time: string
  store_name: string
  store_short_name: string
  store_color?: string
  store_address?: string
  max_participants: number
  current_participants: number
  available_seats: number
  reservation_deadline_hours: number
  is_available: boolean
}

interface ScenarioDetailPageProps {
  scenarioId: string
  onClose?: () => void
}

export function ScenarioDetailPage({ scenarioId, onClose }: ScenarioDetailPageProps) {
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [events, setEvents] = useState<EventSchedule[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadScenarioDetail()
  }, [scenarioId])

  const loadScenarioDetail = async () => {
    try {
      setIsLoading(true)
      
      // シナリオ詳細を取得
      const scenariosData = await scenarioApi.getAll()
      const scenarioData = scenariosData.find((s: any) => s.id === scenarioId)
      
      if (!scenarioData) {
        console.error('シナリオが見つかりません')
        return
      }
      
      // 店舗データを取得
      const storesData = await storeApi.getAll()
      
      // 公演スケジュールを取得（3ヶ月先まで）
      const currentDate = new Date()
      const allEvents: any[] = []
      
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        const events = await scheduleApi.getByMonth(year, month)
        allEvents.push(...events)
      }
      
      // このシナリオの予約可能な公演のみフィルタリング
      const scenarioEvents = allEvents
        .filter((event: any) => {
          // シナリオの照合
          const isMatchingScenario = 
            event.scenario_id === scenarioData.id ||
            event.scenarios?.id === scenarioData.id ||
            event.scenario === scenarioData.title
          
          // 予約可能条件
          const isEnabled = event.is_reservation_enabled !== false
          const isNotCancelled = !event.is_cancelled
          const isOpen = event.category === 'open'
          
          return isMatchingScenario && isEnabled && isNotCancelled && isOpen
        })
        .map((event: any) => {
          const store = storesData.find((s: any) => s.id === event.venue || s.short_name === event.venue)
          const available = (event.max_participants || 8) - (event.current_participants || 0)
          
          return {
            event_id: event.id,
            date: event.date,
            start_time: event.start_time,
            end_time: event.end_time,
            store_name: store?.name || event.venue,
            store_short_name: store?.short_name || event.venue,
            store_color: store?.color,
            store_address: store?.address,
            max_participants: event.max_participants || 8,
            current_participants: event.current_participants || 0,
            available_seats: available,
            reservation_deadline_hours: event.reservation_deadline_hours || 24,
            is_available: available > 0
          }
        })
        .sort((a: any, b: any) => {
          const dateCompare = a.date.localeCompare(b.date)
          if (dateCompare !== 0) return dateCompare
          return a.start_time.localeCompare(b.start_time)
        })
      
      setScenario({
        scenario_id: scenarioData.id,
        scenario_title: scenarioData.title,
        key_visual_url: scenarioData.key_visual_url,
        synopsis: scenarioData.synopsis || scenarioData.description,
        description: scenarioData.description,
        author: scenarioData.author,
        genre: scenarioData.genre || [],
        duration: scenarioData.duration,
        player_count_min: scenarioData.player_count_min,
        player_count_max: scenarioData.player_count_max,
        difficulty: scenarioData.difficulty,
        rating: scenarioData.rating,
        has_pre_reading: scenarioData.has_pre_reading,
        official_site_url: scenarioData.official_site_url,
        participation_fee: scenarioData.participation_fee || 3000
      })
      
      setEvents(scenarioEvents)
    } catch (error) {
      console.error('データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const getUniqueDates = (): string[] => {
    const dates = new Set(events.map(e => e.date))
    return Array.from(dates).sort()
  }

  const getEventsByDate = (date: string): EventSchedule[] => {
    return events.filter(e => e.date === date)
  }

  const handleBooking = (event: EventSchedule) => {
    // TODO: 予約フォームへ遷移
    console.log('予約:', event)
    alert(`予約機能は実装中です\n\n日時: ${formatDate(event.date)} ${formatTime(event.start_time)}\n会場: ${event.store_name}`)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <NavigationBar currentPage="customer-booking" />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg">シナリオが見つかりませんでした</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-7xl px-6 py-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex items-center gap-1.5 hover:bg-accent h-8 px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">シナリオ一覧に戻る</span>
          </Button>
        </div>
      </div>

      {/* ヒーローセクション */}
      <div className="relative bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="container mx-auto max-w-7xl px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* キービジュアル */}
            <div className="lg:col-span-4">
              <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg overflow-hidden shadow-2xl">
                {scenario.key_visual_url ? (
                  <img
                    src={scenario.key_visual_url}
                    alt={scenario.scenario_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <div className="text-center p-8">
                      <p className="font-bold text-2xl">{scenario.scenario_title}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* タイトル・基本情報 */}
            <div className="lg:col-span-8 space-y-4">
              <div>
                <p className="text-sm opacity-80 mb-1">{scenario.author}</p>
                <h1 className="text-3xl font-bold mb-3">{scenario.scenario_title}</h1>
                
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">{scenario.player_count_min}〜{scenario.player_count_max}人</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">{(scenario.duration / 60).toFixed(1)}h</span>
                  </div>
                  
                  {scenario.rating && (
                    <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full text-sm">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{scenario.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>

              {scenario.description && (
                <p className="opacity-90 leading-relaxed">
                  {scenario.description}
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {scenario.genre.map((g, i) => (
                  <Badge key={i} variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5 rounded-sm">
                    {g}
                  </Badge>
                ))}
                {scenario.has_pre_reading && (
                  <Badge variant="outline" className="bg-blue-500/30 text-white border-blue-400 text-xs px-2 py-0.5 rounded-sm">
                    事前読解あり
                  </Badge>
                )}
              </div>

              <div className="flex gap-2">
                {scenario.official_site_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20 h-8 text-sm"
                    onClick={() => window.open(scenario.official_site_url, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1.5" />
                    公式サイト
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container mx-auto max-w-7xl px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左サイドバー - チケット購入 */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">チケット購入</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 公演期間 */}
                {events.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">公演期間</p>
                    <p className="text-sm font-medium">
                      {formatDate(events[0].date)} 〜 {formatDate(events[events.length - 1].date)}
                    </p>
                  </div>
                )}

                {/* 参加費 */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">参加費</p>
                  <p className="text-2xl font-bold text-primary">
                    ¥{scenario.participation_fee.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">/ 1名</p>
                </div>

                {/* 開催日選択 */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">開催日</p>
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {getUniqueDates().map((date) => {
                      const dateEvents = getEventsByDate(date)
                      const hasAvailable = dateEvents.some(e => e.is_available)
                      
                      return (
                        <div key={date} className="border rounded p-2 hover:bg-accent cursor-pointer transition-colors">
                          <div
                            onClick={() => setSelectedDate(selectedDate === date ? null : date)}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{formatDate(date)}</span>
                            </div>
                            {!hasAvailable && (
                              <Badge variant="outline" className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0 rounded-sm">
                                満席
                              </Badge>
                            )}
                          </div>
                          
                          {/* 時間帯選択 */}
                          {selectedDate === date && (
                            <div className="mt-2 space-y-1.5 pl-5">
                              {dateEvents.map((event) => (
                                <div
                                  key={event.event_id}
                                  className="flex items-center justify-between p-1.5 bg-background rounded border"
                                >
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <Clock className="w-3 h-3" />
                                    <span>{formatTime(event.start_time)}</span>
                                    <span className="text-muted-foreground">
                                      残{event.available_seats}席
                                    </span>
                                  </div>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    disabled={!event.is_available}
                                    onClick={() => handleBooking(event)}
                                  >
                                    {event.is_available ? '予約' : '満席'}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右メインエリア - 詳細情報 */}
          <div className="lg:col-span-8 space-y-6">
            {/* ABOUT */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl text-red-600">ABOUT</CardTitle>
                <p className="text-xs text-red-600">公演について</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {scenario.synopsis && (
                  <div>
                    <p className="leading-relaxed whitespace-pre-wrap">{scenario.synopsis}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 主催者情報 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">主催</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                    {scenario.author.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold">{scenario.author}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 会場アクセス */}
            {events.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">会場アクセス</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* ユニークな会場のリスト */}
                  {Array.from(new Set(events.map(e => e.store_name))).map((storeName) => {
                    const event = events.find(e => e.store_name === storeName)!
                    return (
                      <div key={storeName} className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" style={{ color: event.store_color }} />
                          <p className="font-bold" style={{ color: event.store_color }}>
                            {storeName}
                          </p>
                        </div>
                        {event.store_address && (
                          <p className="text-sm text-muted-foreground pl-5.5">
                            {event.store_address}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

            {/* 注意事項 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">注意事項</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• 予約は公演開始の{events[0]?.reservation_deadline_hours || 24}時間前まで可能です</li>
                  <li>• キャンセルは公演開始の24時間前まで無料で可能です</li>
                  <li>• 遅刻された場合、入場をお断りする場合がございます</li>
                  {scenario.has_pre_reading && (
                    <li>• 事前読解が必要なシナリオです。予約確定後に資料をお送りします</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
