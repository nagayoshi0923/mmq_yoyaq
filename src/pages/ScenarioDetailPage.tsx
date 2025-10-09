import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MultiSelect } from '@/components/ui/multi-select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Clock, Users, MapPin, ExternalLink, Star, ArrowLeft } from 'lucide-react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { getColorFromName } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BookingConfirmation } from './BookingConfirmation'
import { PrivateBookingRequest } from './PrivateBookingRequest'

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

// 時間枠の定義
interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

const TIME_SLOTS: TimeSlot[] = [
  { label: '朝', startTime: '10:00', endTime: '13:00' },
  { label: '昼', startTime: '14:00', endTime: '17:00' },
  { label: '夜', startTime: '18:00', endTime: '21:00' },
]

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
  const [isLoading, setIsLoading] = useState(true)
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  const [activeTab, setActiveTab] = useState<'schedule' | 'private'>('schedule')
  const [showPrivateBookingRequest, setShowPrivateBookingRequest] = useState(false)
  const MAX_SELECTIONS = 10

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
        setStores(storesData)
      } catch (error) {
        console.error('店舗データの取得エラー:', error)
        storesData = []
        setStores([])
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

  // 特定の日付と時間枠が空いているかチェック（店舗フィルター対応）
  const checkTimeSlotAvailability = (date: string, slot: TimeSlot, storeIds?: string[]): boolean => {
    // 店舗が選択されている場合
    if (storeIds && storeIds.length > 0) {
      // 選択された店舗のいずれかで空いていればtrue
      return storeIds.some(storeId => {
        // その店舗のその日のイベントを取得
        const storeEvents = events.filter(e => e.date === date && e.store_id === storeId)
        
        // その店舗にイベントがなければ空き
        if (storeEvents.length === 0) return true
        
        // 時間枠と重複するイベントがあるかチェック
        const hasConflict = storeEvents.some(event => {
          const eventStart = event.start_time.slice(0, 5)
          const eventEnd = event.end_time.slice(0, 5)
          const slotStart = slot.startTime
          const slotEnd = slot.endTime
          
          // 時間の重複をチェック
          return !(eventEnd <= slotStart || eventStart >= slotEnd)
        })
        
        // 重複がなければ空き
        return !hasConflict
      })
    }
    
    // 店舗が選択されていない場合：すべての店舗を対象
    // 少なくとも1つの店舗で空いていればtrue
    const allStoreIds = stores.map(s => s.id)
    
    return allStoreIds.some(storeId => {
      const storeEvents = events.filter(e => e.date === date && e.store_id === storeId)
      
      if (storeEvents.length === 0) return true
      
      const hasConflict = storeEvents.some(event => {
        const eventStart = event.start_time.slice(0, 5)
        const eventEnd = event.end_time.slice(0, 5)
        const slotStart = slot.startTime
        const slotEnd = slot.endTime
        
        return !(eventEnd <= slotStart || eventStart >= slotEnd)
      })
      
      return !hasConflict
    })
  }

  // 貸切リクエスト用の日付リストを生成（指定月の1ヶ月分）
  const generatePrivateDates = () => {
    const dates: string[] = []
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // 月の最初の日
    const firstDay = new Date(year, month, 1)
    // 月の最後の日
    const lastDay = new Date(year, month + 1, 0)
    
    // 今日より前の日は表示しない
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day)
      if (date >= today) {
        dates.push(date.toISOString().split('T')[0])
      }
    }
    
    return dates
  }

  // 月を切り替え
  const changeMonth = (offset: number) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + offset)
    setCurrentMonth(newMonth)
  }

  // 時間枠の選択/解除を切り替え
  const toggleTimeSlot = (date: string, slot: TimeSlot) => {
    const exists = selectedTimeSlots.some(
      s => s.date === date && s.slot.label === slot.label
    )
    
    if (exists) {
      // 既に選択されている場合は解除
      setSelectedTimeSlots(selectedTimeSlots.filter(
        s => !(s.date === date && s.slot.label === slot.label)
      ))
    } else {
      // 未選択の場合は追加（最大10枠まで）
      if (selectedTimeSlots.length < MAX_SELECTIONS) {
        setSelectedTimeSlots([...selectedTimeSlots, { date, slot }])
      } else {
        alert(`最大${MAX_SELECTIONS}枠まで選択できます`)
      }
    }
  }

  // 時間枠が選択されているかチェック
  const isTimeSlotSelected = (date: string, slot: TimeSlot): boolean => {
    return selectedTimeSlots.some(
      s => s.date === date && s.slot.label === slot.label
    )
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

  const handlePrivateBookingComplete = () => {
    setShowPrivateBookingRequest(false)
    setSelectedTimeSlots([])
    // データを再読み込み
    loadScenarioDetail()
  }

  const handleBackFromPrivateBooking = () => {
    setShowPrivateBookingRequest(false)
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
        onBack={handleBackFromBooking}
        onComplete={handleBookingComplete}
      />
    )
  }

  // 貸切リクエスト確認画面を表示
  if (showPrivateBookingRequest && scenario) {
    return (
      <PrivateBookingRequest
        scenarioTitle={scenario.scenario_title}
        scenarioId={scenario.scenario_id}
        participationFee={scenario.participation_fee}
        maxParticipants={scenario.player_count_max}
        selectedTimeSlots={selectedTimeSlots}
        selectedStoreIds={selectedStoreIds}
        stores={stores}
        onBack={handleBackFromPrivateBooking}
        onComplete={handlePrivateBookingComplete}
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
              {/* タブ: 公演日程 / 貸切リクエスト */}
              <Tabs defaultValue="schedule" className="w-full" onValueChange={(value) => setActiveTab(value as 'schedule' | 'private')}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="schedule">公演日程</TabsTrigger>
                  <TabsTrigger value="private">貸切リクエスト</TabsTrigger>
                </TabsList>
                
                {/* 公演日程タブ */}
                <TabsContent value="schedule">
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
                      const dayOfWeek = eventDate.getDay()
                      const weekdayColor = dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
                      
                      return (
                        <Card 
                          key={event.event_id}
                          className={`transition-all overflow-hidden ${
                            event.available_seats === 0
                              ? 'opacity-50 cursor-not-allowed bg-gray-50 border border-gray-200'
                              : `cursor-pointer ${isSelected ? 'border-2 border-blue-500 bg-blue-50' : 'hover:bg-accent border'}`
                          }`}
                          onClick={() => {
                            if (event.available_seats === 0) return
                            setSelectedDate(isSelected ? null : event.date)
                          }}
                        >
                          <div className="flex items-center justify-between gap-2 p-2">
                            {/* 左側：日付と店舗情報 */}
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              {/* 日付 */}
                              <div className="font-semibold text-sm whitespace-nowrap min-w-[45px] text-center">
                                <div>{month}/{day}</div>
                                <div className={`text-xs ${weekdayColor}`}>
                                  ({weekday})
                                </div>
                              </div>
                              
                              {/* 店舗カラーの正方形 + 店舗名 + 時間 */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <div 
                                    className="flex-shrink-0 w-3 h-3 rounded-sm"
                              style={{ 
                                      backgroundColor: event.store_color || '#9CA3AF'
                                    }}
                                  />
                                  <span 
                                    className="text-sm font-medium"
                                    style={{ 
                                      color: event.store_color || '#6B7280'
                                    }}
                                  >
                                    {event.store_short_name}
                                  </span>
                                  <span className="font-semibold text-sm">
                                    {formatTime(event.start_time)}〜
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {event.scenario_title || scenario.scenario_title}
                                </div>
                              </div>
                            </div>
                            
                            {/* 中央：残り人数 / 満席バッジ */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {event.available_seats === 0 ? (
                                <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300 text-sm px-3 py-1">
                                  満席
                                </Badge>
                              ) : (
                                <div className="text-right">
                                  <div className="font-semibold text-base">
                                    残り{event.available_seats}人
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* 右側：選択ボタン */}
                              <Button
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                              disabled={event.available_seats === 0}
                              className={`flex-shrink-0 min-w-[70px] ${
                                isSelected ? "bg-blue-500 text-white hover:bg-blue-600" : ""
                              }`}
                              >
                              {event.available_seats === 0 ? '満席' : '選択'}
                              </Button>
                          </div>
                        </Card>
                      )
                    })
                  )}
                </div>
              </div>
                </TabsContent>
                
                {/* 貸切リクエストタブ */}
                <TabsContent value="private">
                  <div>
                    {/* 店舗選択 */}
                    <div className="mb-3">
                      <label className="text-sm font-medium mb-1.5 block">店舗を選択</label>
                      <MultiSelect
                        options={stores.map(store => ({
                          id: store.id,
                          name: store.name
                        }))}
                        selectedValues={selectedStoreIds.map(id => stores.find(s => s.id === id)?.name || '').filter(Boolean)}
                        onSelectionChange={(storeNames) => {
                          const storeIds = storeNames.map(name => 
                            stores.find(s => s.name === name)?.id || ''
                          ).filter(Boolean)
                          setSelectedStoreIds(storeIds)
                        }}
                        placeholder="店舗を選択（未選択=すべて）"
                        showBadges={false}
                      />
                      {/* 選択された店舗を小さいバッジで表示 */}
                      {selectedStoreIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedStoreIds.map(id => {
                            const store = stores.find(s => s.id === id)
                            return store ? (
                              <Badge 
                                key={id} 
                                variant="secondary" 
                                className="text-[10px] px-1.5 py-0 h-auto"
                              >
                                {store.short_name || store.name}
                              </Badge>
                            ) : null
                          })}
                        </div>
                      )}
                    </div>
                    
                    {/* 月切り替え */}
                    <div className="flex items-center justify-between mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeMonth(-1)}
                        disabled={currentMonth.getMonth() === new Date().getMonth() && currentMonth.getFullYear() === new Date().getFullYear()}
                      >
                        &lt; 前月
                      </Button>
                      <h3 className="font-bold">
                        {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeMonth(1)}
                      >
                        次月 &gt;
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {generatePrivateDates().map((date) => {
                        const dateObj = new Date(date)
                        const month = dateObj.getMonth() + 1
                        const day = dateObj.getDate()
                        const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                        const weekday = weekdays[dateObj.getDay()]
                        
                        // 曜日の色分け
                        const dayOfWeek = dateObj.getDay()
                        const weekdayColor = dayOfWeek === 0 ? 'text-red-600' : dayOfWeek === 6 ? 'text-blue-600' : ''
                        
                        return (
                          <Card key={date}>
                            <CardContent className="p-2">
                              <div className="flex items-center gap-2">
                                {/* 日付 */}
                                <div className="font-semibold text-sm whitespace-nowrap min-w-[45px] text-center">
                                  <div>{month}/{day}</div>
                                  <div className={`text-xs ${weekdayColor}`}>
                                    ({weekday})
                                  </div>
                                </div>
                                
                                {/* 時間枠ボタン */}
                                <div className="flex gap-1 flex-1">
                                  {TIME_SLOTS.map((slot) => {
                                    const isAvailable = checkTimeSlotAvailability(date, slot, selectedStoreIds.length > 0 ? selectedStoreIds : undefined)
                                    const isSelected = isTimeSlotSelected(date, slot)
                                    
                                    return (
                                      <Button
                                        key={slot.label}
                                        variant={isSelected ? "default" : "outline"}
                                        size="sm"
                                        className={`flex-1 py-1.5 h-auto text-xs px-1 ${
                                          !isAvailable 
                                            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                                            : isSelected
                                            ? 'bg-purple-500 text-white hover:bg-purple-600 border-purple-500'
                                            : 'hover:border-purple-300'
                                        }`}
                                        disabled={!isAvailable}
                                        onClick={() => {
                                          if (isAvailable) {
                                            toggleTimeSlot(date, slot)
                                          }
                                        }}
                                      >
                                        <div className="flex flex-col items-center leading-tight gap-0.5">
                                          <span className={`font-semibold ${isSelected ? 'text-white' : ''}`}>
                                            {slot.label}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            <span className={`text-[10px] font-medium ${
                                              isSelected ? 'text-white' : isAvailable ? 'text-purple-600' : 'text-gray-500'
                                            }`}>
                                              {slot.startTime}〜
                                            </span>
                                            {!isAvailable && (
                                              <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-300 text-[9px] px-1 py-0 h-auto">
                                                満席
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </Button>
                                    )
                                  })}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                    
                    {/* 選択された時間枠の表示 */}
                    {selectedTimeSlots.length > 0 && (
                      <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="text-xs font-medium text-purple-900 mb-2">
                          選択中の候補日時 ({selectedTimeSlots.length}/{MAX_SELECTIONS})
                        </div>
                        <div className="space-y-1">
                          {selectedTimeSlots.map((item, index) => {
                            const dateObj = new Date(item.date)
                            const month = dateObj.getMonth() + 1
                            const day = dateObj.getDate()
                            const weekdays = ['日', '月', '火', '水', '木', '金', '土']
                            const weekday = weekdays[dateObj.getDay()]
                            
                            return (
                              <div key={`${item.date}-${item.slot.label}`} className="flex items-center justify-between text-xs">
                                <span className="text-purple-900">
                                  {index + 1}. {month}/{day}({weekday}) {item.slot.label} {item.slot.startTime}〜
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 hover:bg-red-100"
                                  onClick={() => toggleTimeSlot(item.date, item.slot)}
                                >
                                  ×
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* タブの内容に応じて表示を切り替え */}
              <div className="mt-6">
                {/* 公演日程タブの場合 */}
                {activeTab === 'schedule' && (
                <div className="space-y-6">
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
                )}

                {/* 貸切リクエストタブの場合 */}
                {activeTab === 'private' && (
                <div className="space-y-6">
                  {/* 貸切料金情報 */}
              <div>
                    <h3 className="font-bold mb-3">料金（目安）</h3>
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
                            <span className="text-muted-foreground">最大人数</span>
                            <span className="font-medium">× {scenario.player_count_max}名</span>
                          </div>
                          <div className="border-t pt-2 flex justify-between items-center">
                            <span className="font-bold">合計</span>
                            <span className="text-2xl font-bold text-purple-600">
                              ¥{(scenario.participation_fee * scenario.player_count_max).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-purple-50 border border-purple-200 rounded p-3 text-sm text-purple-800">
                            <p className="font-medium mb-1">貸切料金</p>
                            <p className="text-xs">詳細はリクエスト後にご相談</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

                  {/* 貸切リクエスト送信ボタン */}
              <Button 
                    className="w-full bg-purple-600 text-white hover:bg-purple-700 h-12 font-bold"
                    onClick={() => {
                      if (!user) {
                        window.location.hash = 'login'
                        return
                      }
                      setShowPrivateBookingRequest(true)
                    }}
                    disabled={!user || selectedTimeSlots.length === 0}
                  >
                    {!user ? 'ログインして貸切リクエスト' : selectedTimeSlots.length === 0 ? '候補日時を選択してください' : `貸切リクエスト確認へ (${selectedTimeSlots.length}件)`}
              </Button>
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
