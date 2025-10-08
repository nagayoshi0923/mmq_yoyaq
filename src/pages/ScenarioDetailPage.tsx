import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Clock, Users, MapPin, ExternalLink, Star, ArrowLeft } from 'lucide-react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { getColorFromName } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BookingConfirmation } from './BookingConfirmation'

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
  store_id: string
  store_name: string
  store_short_name: string
  store_color?: string
  store_address?: string
  scenario_title?: string
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
  const { user } = useAuth()
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [events, setEvents] = useState<EventSchedule[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventSchedule | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false)

  useEffect(() => {
    loadScenarioDetail()
  }, [scenarioId])

  useEffect(() => {
    if (user) {
      loadCustomerInfo()
    }
  }, [user])

  const loadCustomerInfo = async () => {
    if (!user) return
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('name, email, phone')
        .eq('user_id', user.id)
        .single()
      
      if (error) {
        // customersテーブルにデータがない場合はログインユーザーのメールのみ設定
        setCustomerEmail(user.email || '')
        return
      }
      
      if (data) {
        setCustomerName(data.name || '')
        setCustomerEmail(data.email || user.email || '')
        setCustomerPhone(data.phone || '')
      }
    } catch (error) {
      // エラーの場合もログインユーザーのメールを設定
      setCustomerEmail(user.email || '')
    }
  }

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
      let storesData: any[] = []
      try {
        // デバッグ用（必要に応じてコメントアウト）
        // const { data: directData, error: directError } = await supabase
        //   .from('stores')
        //   .select('*')
        // if (directError) {
        //   console.error('店舗データ直接クエリエラー:', directError.message)
        // } else {
        //   console.log('店舗データ直接クエリ成功:', directData?.length || 0, '件')
        // }
        
        storesData = await storeApi.getAll()
        
      } catch (error) {
        console.error('店舗データの取得エラー:', error)
        storesData = []
      }
      
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
          
          // 店舗カラーを取得（色名から実際の色コードに変換）
          const storeColor = store?.color ? getColorFromName(store.color) : '#6B7280'
          
          // デバッグ用（必要に応じてコメントアウト）
          // console.log('店舗カラー変換:', { storeName: store?.name, colorName: store?.color, finalColor: storeColor })
          
          return {
            event_id: event.id,
            date: event.date,
            start_time: event.start_time,
            end_time: event.end_time,
            store_id: event.store_id,
            store_name: store?.name || event.venue,
            store_short_name: store?.short_name || event.venue,
            store_color: storeColor,
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

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const handleBooking = () => {
    if (!selectedDate) {
      alert('日付を選択してください')
      return
    }
    
    const event = events.find(e => e.date === selectedDate)
    if (!event) {
      alert('選択された日付の公演が見つかりません')
      return
    }
    
    if (!event.is_available) {
      alert('この公演は満席です')
      return
    }
    
    setSelectedEvent(event)
    setShowBookingConfirmation(true)
  }

  const handleBookingComplete = () => {
    setShowBookingConfirmation(false)
    setSelectedEvent(null)
    setSelectedDate(null)
    // データを再読み込み
    loadScenarioDetail()
  }

  const handleBackFromBooking = () => {
    setShowBookingConfirmation(false)
    setSelectedEvent(null)
  }

  // 予約確認画面を表示
  if (showBookingConfirmation && selectedEvent && scenario) {
    return (
      <BookingConfirmation
        eventId={selectedEvent.event_id}
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_id}
        storeId={selectedEvent.store_id}
        eventDate={selectedEvent.date}
        startTime={selectedEvent.start_time}
        endTime={selectedEvent.end_time}
        storeName={selectedEvent.store_name}
        storeAddress={selectedEvent.store_address}
        storeColor={selectedEvent.store_color}
        maxParticipants={selectedEvent.max_participants}
        currentParticipants={selectedEvent.current_participants}
        participationFee={scenario.participation_fee}
        initialParticipantCount={participantCount}
        initialCustomerName={customerName}
        initialCustomerEmail={customerEmail}
        initialCustomerPhone={customerPhone}
        onBack={handleBackFromBooking}
        onComplete={handleBookingComplete}
      />
    )
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
                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs px-2 py-0.5 rounded-sm">
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
          {/* 左メインエリア - 詳細情報 */}
          <div className="lg:col-span-8 space-y-6">
            {/* ABOUT */}
            <div>
              <h3 className="font-bold mb-3">ABOUT</h3>
              <Card>
                <CardContent className="p-4 space-y-3">
                {/* 概要（基本情報） */}
                <div className="bg-muted/50 p-3 rounded space-y-2">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>{scenario.player_count_min}〜{scenario.player_count_max}人</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>{(scenario.duration / 60).toFixed(1)}時間</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scenario.genre.map((g, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {g}
                      </Badge>
                    ))}
                    {scenario.has_pre_reading && (
                      <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                        事前読解あり
                      </Badge>
                    )}
                  </div>
                </div>

                {/* あらすじ */}
                {scenario.synopsis && (
                  <div>
                    <p className="leading-relaxed whitespace-pre-wrap">{scenario.synopsis}</p>
                  </div>
                )}
                </CardContent>
              </Card>
            </div>

            {/* 会場アクセス */}
            {events.length > 0 && (
              <div>
                <h3 className="font-bold mb-3">会場アクセス</h3>
                <Card>
                  <CardContent className="p-4 space-y-3">
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
              </div>
            )}

            {/* 注意事項 */}
            <div>
              <h3 className="font-bold mb-3">注意事項</h3>
              <Card>
                <CardContent className="p-4">
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

            {/* 主催者情報 - 一番下 */}
            <div>
              <h3 className="font-bold mb-3 text-muted-foreground">主催</h3>
              <Card>
                <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {scenario.author.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{scenario.author}</p>
                  </div>
                </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右サイドバー - チケット購入 */}
          <div className="lg:col-span-4">
            <div className="sticky top-4 space-y-6">
              {/* 日付を選択 */}
              <div>
                <h3 className="font-bold mb-3">日付を選択</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {events.length === 0 ? (
                    <Card>
                      <CardContent className="p-4 text-center text-muted-foreground">
                        現在予約可能な公演はありません
                      </CardContent>
                    </Card>
                  ) : (
                    events.map((event) => {
                      const isSelected = selectedDate === event.date
                      const eventDate = new Date(event.date)
                      const month = eventDate.getMonth() + 1
                      const day = eventDate.getDate()
                      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                      const weekday = weekdays[eventDate.getDay()]
                      
                      return (
                        <Card 
                          key={event.event_id}
                          className={`cursor-pointer transition-all overflow-hidden ${
                            isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'hover:bg-accent border'
                          }`}
                          onClick={() => setSelectedDate(isSelected ? null : event.date)}
                        >
                          <div className="flex items-center justify-between gap-3 p-3">
                            {/* 左側：日付と店舗情報 */}
                            <div className="flex-1 min-w-0 flex items-start gap-3">
                              {/* 店舗カラーの正方形あしらい */}
                              <div 
                                className="flex-shrink-0 w-3 h-3 rounded-sm mt-1"
                                style={{ 
                                  backgroundColor: event.store_color || '#9CA3AF'
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-base mb-0.5">
                                  {month}月{day}日({weekday})　{formatTime(event.start_time)}〜
                                </div>
                                <div 
                                  className="text-sm font-medium"
                                  style={{ 
                                    color: event.store_color || '#6B7280'
                                  }}
                                >
                                  {event.store_short_name} {event.scenario_title || scenario.scenario_title}
                                </div>
                              </div>
                            </div>
                            
                            {/* 中央：残り人数 */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="text-right">
                                <div className="font-semibold text-base">
                                  残り{event.available_seats}人
                                </div>
                              </div>
                            </div>
                            
                            {/* 右側：選択ボタン */}
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className={`flex-shrink-0 min-w-[70px] ${
                                isSelected ? "bg-blue-500 text-white hover:bg-blue-600" : ""
                              }`}
                            >
                              選択
                            </Button>
                          </div>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 人数を選択 */}
              <div>
                <h3 className="font-bold mb-3">人数を選択</h3>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">予約人数</span>
                      <select 
                        className="border rounded px-3 py-1.5 text-sm"
                        value={participantCount}
                        onChange={(e) => setParticipantCount(Number(e.target.value))}
                      >
                        {Array.from({ length: scenario.player_count_max }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}名
                          </option>
                        ))}
                      </select>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* お客様情報 */}
              <div>
                <h3 className="font-bold mb-3">お客様情報</h3>
                {user ? (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">
                          お名前 <span className="text-red-500">*</span>
                        </label>
                        <Input 
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="山田太郎"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">
                          メールアドレス <span className="text-red-500">*</span>
                        </label>
                        <Input 
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="example@email.com"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">
                          電話番号 <span className="text-red-500">*</span>
                        </label>
                        <Input 
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="09012345678"
                        />
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">お名前</label>
                        <Input placeholder="山田太郎" disabled />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">メールアドレス</label>
                        <Input type="email" placeholder="example@email.com" disabled />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium mb-1.5 block">電話番号</label>
                        <Input type="tel" placeholder="09012345678" disabled />
                      </div>
                      
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                        予約にはログインが必要です
                      </div>
                      
                      <Button 
                        className="w-full"
                        onClick={() => window.location.hash = 'login'}
                      >
                        ログインする
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* 料金情報 */}
              <div>
                <h3 className="font-bold mb-3">料金</h3>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">参加費（1名）</span>
                        <span className="font-medium">
                          ¥{scenario.participation_fee.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">人数</span>
                        <span className="font-medium">× {participantCount}名</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between items-center">
                        <span className="font-bold">合計</span>
                        <span className="text-2xl font-bold text-blue-600">
                          ¥{(scenario.participation_fee * participantCount).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                        <p className="font-medium mb-1">現地決済</p>
                        <p className="text-xs">当日会場にてお支払いください</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 予約確認ボタン */}
              <Button 
                className="w-full bg-blue-600 text-white hover:bg-blue-700 h-12 font-bold"
                onClick={handleBooking}
                disabled={!selectedDate || !user}
              >
                {!user ? 'ログインして予約する' : !selectedDate ? '日付を選択してください' : '予約確認へ進む'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
