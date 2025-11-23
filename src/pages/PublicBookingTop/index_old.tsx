import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Search, Calendar, Clock, Users, MapPin } from 'lucide-react'
import { scheduleApi, storeApi, scenarioApi } from '@/lib/api'
import { getColorFromName } from '@/lib/utils'
import type { PublicScenarioEvent } from '@/types'
import { logger } from '@/utils/logger'

interface ScenarioCard {
  scenario_id: string
  scenario_title: string
  key_visual_url?: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  genre: string[]
  next_event_date?: string
  next_event_time?: string
  store_name?: string
  store_color?: string
  available_seats?: number
  status: 'available' | 'few_seats' | 'sold_out' | 'private_booking'
  is_new?: boolean
}

interface PublicBookingTopProps {
  onScenarioSelect?: (scenarioId: string) => void
}

export function PublicBookingTop({ onScenarioSelect }: PublicBookingTopProps) {
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => {
    // URLハッシュから初期タブを決定
    const hash = window.location.hash
    if (hash.includes('calendar')) return 'calendar'
    if (hash.includes('list')) return 'list'
    return 'lineup'
  })
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [allEvents, setAllEvents] = useState<any[]>([]) // カレンダー用の全公演データ
  
  // リスト表示用の状態
  const [listViewMonth, setListViewMonth] = useState(new Date())
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all') // 'all' or storeId

  useEffect(() => {
    loadScenarios()
  }, [])
  
  // タブ変更時にURLハッシュを更新
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'calendar') {
      window.location.hash = 'customer-booking/calendar'
    } else if (value === 'list') {
      window.location.hash = 'customer-booking/list'
    } else {
      window.location.hash = 'customer-booking'
    }
  }

  const loadScenarios = async () => {
    try {
      setIsLoading(true)
      
      // シナリオと公演データを取得
      const scenariosData = await scenarioApi.getAll()
      
      let storesData: any[] = []
      try {
        storesData = await storeApi.getAll()
        
      } catch (error) {
        logger.error('店舗データの取得エラー:', error)
        storesData = []
      }
      
      // 現在の月から3ヶ月先までの公演を取得
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
      
      // logger.log('取得した公演数:', allEvents.length)
      
      // 予約可能な公演 + 確定貸切公演をフィルタリング
      const publicEvents = allEvents.filter((event: any) => {
        const isNotCancelled = !event.is_cancelled
        
        // 通常公演: category='open' かつ is_reservation_enabled=true
        const isOpenAndEnabled = (event.is_reservation_enabled !== false) && (event.category === 'open')
        
        // 貸切公演: is_private_booking=true（予約不可として表示）
        const isPrivateBooking = event.is_private_booking === true
        
        return isNotCancelled && (isOpenAndEnabled || isPrivateBooking)
      })
      
      // logger.log('予約可能な公演数:', publicEvents.length)
      
      // シナリオごとにグループ化
      const scenarioMap = new Map<string, ScenarioCard>()
      
      scenariosData.forEach((scenario: any) => {
        // ステータスがavailableでないシナリオはスキップ
        if (scenario.status !== 'available') return
        
        // このシナリオの公演を探す（scenario_idまたはタイトルで照合）
        const scenarioEvents = publicEvents.filter((event: any) => {
          // scenario_idで照合（リレーション）
          if (event.scenario_id === scenario.id) return true
          // scenariosオブジェクトのIDで照合
          if (event.scenarios?.id === scenario.id) return true
          // タイトルで照合（フォールバック）
          if (event.scenario === scenario.title) return true
          return false
        })
        
        // logger.log(`シナリオ「${scenario.title}」の公演数:`, scenarioEvents.length)
        
        // 新着判定（リリース日から30日以内）
        const isNew = scenario.release_date ? 
          (new Date().getTime() - new Date(scenario.release_date).getTime()) / (1000 * 60 * 60 * 24) <= 30 : 
          false
        
        // 公演がある場合
        if (scenarioEvents.length > 0) {
          // 最も近い公演を取得
          const nextEvent = scenarioEvents.sort((a: any, b: any) => {
            const dateCompare = a.date.localeCompare(b.date)
            if (dateCompare !== 0) return dateCompare
            return a.start_time.localeCompare(b.start_time)
          })[0]
          
          const store = storesData.find((s: any) => s.id === nextEvent.venue || s.short_name === nextEvent.venue)
          
          // 貸切公演の場合は満席として扱う
          const isPrivateBooking = nextEvent.is_private_booking === true
          const availableSeats = isPrivateBooking ? 0 : (nextEvent.max_participants || 8) - (nextEvent.current_participants || 0)
          const status = isPrivateBooking ? 'sold_out' : getAvailabilityStatus(nextEvent.max_participants || 8, nextEvent.current_participants || 0)
          
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            next_event_date: nextEvent.date,
            next_event_time: nextEvent.start_time,
            store_name: store?.name || nextEvent.venue,
            store_color: store?.color,
            available_seats: availableSeats,
            status: status,
            is_new: isNew
          })
        } else {
          // 公演がない場合でも、全タイトル用にシナリオ情報を追加
          scenarioMap.set(scenario.id, {
            scenario_id: scenario.id,
            scenario_title: scenario.title,
            key_visual_url: scenario.key_visual_url,
            author: scenario.author,
            duration: scenario.duration,
            player_count_min: scenario.player_count_min,
            player_count_max: scenario.player_count_max,
            genre: scenario.genre || [],
            status: 'private_booking', // 公演予定なしは「貸切受付中」
            is_new: isNew
          })
        }
      })
      
      const scenarioList = Array.from(scenarioMap.values())
      // logger.log('最終的なシナリオ数:', scenarioList.length)
      
      setScenarios(scenarioList)
      setAllEvents(publicEvents) // カレンダー用に全公演データを保存
      setStores(storesData) // 店舗データを保存
      
      // デバッグ: データがない場合の警告
      if (scenarioList.length === 0) {
        console.warn('⚠️ 表示可能なシナリオがありません')
        console.warn('原因の可能性:')
        console.warn('1. シナリオデータが登録されていない')
        console.warn('2. 予約可能な公演（category=open）が登録されていない')
        console.warn('3. is_reservation_enabledがfalseになっている')
        console.warn('4. シナリオと公演の紐付けが正しくない')
      }
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getAvailabilityStatus = (max: number, current: number): 'available' | 'few_seats' | 'sold_out' => {
    const available = max - current
    if (available === 0) return 'sold_out'
    if (available <= 2) return 'few_seats'
    return 'available'
  }

  // 検索フィルター
  const getFilteredScenarios = () => {
    if (!searchTerm) return scenarios
    
    return scenarios.filter(s =>
      s.scenario_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.genre.some(g => g.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }

  // 新着公演（リリース日から30日以内）
  const getNewScenarios = () => {
    const filtered = getFilteredScenarios()
    return filtered.filter(s => s.is_new)
  }

  // 直近公演（7日以内）
  const getUpcomingScenarios = () => {
    const filtered = getFilteredScenarios()
    const weekLater = new Date()
    weekLater.setDate(weekLater.getDate() + 7)
    return filtered.filter(s => {
      if (!s.next_event_date) return false
      const eventDate = new Date(s.next_event_date)
      return eventDate <= weekLater
    })
  }

  // 全タイトル
  const getAllScenarios = () => {
    return getFilteredScenarios()
  }

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  const handleCardClick = (scenarioId: string) => {
    if (onScenarioSelect) {
      onScenarioSelect(scenarioId)
    } else {
      // logger.log('シナリオ詳細へ:', scenarioId)
    }
  }
  
  // カレンダー用：月を変更
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  // リスト表示用の月変更
  const changeListViewMonth = (direction: 'prev' | 'next') => {
    setListViewMonth(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1)
      } else {
        newDate.setMonth(newDate.getMonth() + 1)
      }
      return newDate
    })
  }

  // リスト表示用のデータ読み込み（データは既にloadScenariosで読み込まれている）
  useEffect(() => {
    if (activeTab === 'list') {
      // データは既にloadScenariosで読み込まれているため、追加の読み込みは不要
    }
  }, [listViewMonth, activeTab])
  
  // カレンダー用：月の日付を生成（月曜始まり）
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // 月の最初の日と最後の日
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // 月曜日を0とする曜日（0=月曜, 6=日曜）
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7 // 月曜始まりに調整
    const lastDate = lastDay.getDate()
    
    const days = []
    
    // 前月の日付で埋める
    for (let i = 0; i < firstDayOfWeek; i++) {
      const date = new Date(year, month, -firstDayOfWeek + i + 1)
      days.push({ date, isCurrentMonth: false })
    }
    
    // 当月の日付
    for (let i = 1; i <= lastDate; i++) {
      const date = new Date(year, month, i)
      days.push({ date, isCurrentMonth: true })
    }
    
    // 次月の日付で埋める（7の倍数になるまで）
    const remainingDays = 7 - (days.length % 7)
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        const date = new Date(year, month + 1, i)
        days.push({ date, isCurrentMonth: false })
      }
    }
    
    return days
  }
  
  // カレンダー用：特定日の公演を取得（店舗フィルター適用）
  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    let filtered = allEvents.filter(event => event.date === dateStr)
    
    // 店舗フィルター適用
    if (selectedStoreFilter !== 'all') {
      filtered = filtered.filter(event => event.store_id === selectedStoreFilter || event.venue === selectedStoreFilter)
    }
    
    return filtered
  }

  // リスト表示用：月の日付と店舗の組み合わせを生成
  const generateListViewData = () => {
    const year = listViewMonth.getFullYear()
    const month = listViewMonth.getMonth()
    
    // 月の日付を生成
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    
    // 店舗フィルター適用
    const filteredStores = selectedStoreFilter === 'all' 
      ? stores 
      : stores.filter(store => store.id === selectedStoreFilter)
    
    // 日付と店舗の組み合わせを生成
    const combinations: Array<{ date: number; store: any }> = []
    dates.forEach(date => {
      filteredStores.forEach(store => {
        combinations.push({ date, store })
      })
    })
    
    return combinations
  }

  // リスト表示用：特定の日付・店舗の公演を取得
  const getEventsForDateStore = (date: number, storeId: string) => {
    const dateStr = `${listViewMonth.getFullYear()}-${String(listViewMonth.getMonth() + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    const filtered = allEvents.filter((event: any) => {
      const eventStore = event.venue || event.store_id
      // より柔軟な店舗照合（ID、short_name、nameで照合）
      const storeMatches = eventStore === storeId || 
                          eventStore === stores.find(s => s.id === storeId)?.short_name ||
                          eventStore === stores.find(s => s.id === storeId)?.name ||
                          stores.find(s => s.id === storeId)?.short_name === eventStore ||
                          stores.find(s => s.id === storeId)?.name === eventStore
      
      return event.date === dateStr && storeMatches
    })
    
    return filtered
  }
  
  // 店舗名を取得
  const getStoreName = (event: any): string => {
    const store = stores.find(s => s.id === event.store_id || s.id === event.venue)
    return store?.short_name || store?.name || ''
  }
  
  // 店舗カラーを取得
  const getStoreColor = (event: any): string => {
    const store = stores.find(s => s.id === event.store_id || s.id === event.venue)
    return store?.color ? getColorFromName(store.color) : '#6B7280'
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sold_out':
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200 text-xs px-1.5 py-0 rounded-sm">完売</Badge>
      case 'few_seats':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 text-xs px-1.5 py-0 rounded-sm">残りわずか</Badge>
      case 'private_booking':
        return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs px-1.5 py-0 rounded-sm">貸切受付中</Badge>
      default:
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs px-1.5 py-0 rounded-sm">開催中</Badge>
    }
  }

  // シナリオカードコンポーネント
  const ScenarioCard = ({ scenario, onClick }: { scenario: ScenarioCard; onClick: (id: string) => void }) => (
    <Card
      className="cursor-pointer hover:shadow-xl transition-all duration-300 overflow-hidden group flex flex-col"
      onClick={() => onClick(scenario.scenario_id)}
    >
      <div className="relative aspect-[3/4] bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
        {scenario.key_visual_url ? (
          <img
            src={scenario.key_visual_url}
            alt={scenario.scenario_title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <div className="text-center p-4">
              <p className="text-lg">{scenario.scenario_title}</p>
            </div>
          </div>
        )}
        {/* NEW バッジ */}
        {scenario.is_new && (
          <div className="absolute top-1.5 left-1.5">
            <Badge className="bg-red-100 text-red-800 border-red-200 text-xs px-1.5 py-0 rounded-sm">NEW</Badge>
          </div>
        )}
      </div>
      
      <CardContent className="p-1 flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground">{scenario.author}</div>
        <h3 className="text-sm line-clamp-2 mb-0.5">
          {scenario.scenario_title}
        </h3>
        
        {/* アイコン情報 */}
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground mb-1">
          <div className="flex items-center gap-0.5">
            <Users className="w-3 h-3" />
            <span>{scenario.player_count_min}〜{scenario.player_count_max}人</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            <span>{(scenario.duration / 60).toFixed(1)}h</span>
          </div>
        </div>
        
        {scenario.store_name && (
          <div className="flex items-center gap-0.5 text-xs mb-1">
            <MapPin className="w-3 h-3" />
            <span className="" style={{ color: scenario.store_color }}>
              {scenario.store_name}
            </span>
          </div>
        )}
        
        {scenario.next_event_date && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground mb-1">
            <Calendar className="w-3 h-3" />
            <span>次回: {formatDate(scenario.next_event_date)}</span>
          </div>
        )}
        
        {scenario.genre.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {scenario.genre.slice(0, 2).map((g, i) => (
              <Badge key={i} variant="outline" className="text-xs px-1.5 py-0 rounded-sm">
                {g}
              </Badge>
            ))}
          </div>
        )}
        
        {/* ステータスバッジ - カードの一番下 */}
        <div className="mt-auto pt-1">
          {getStatusBadge(scenario.status)}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      {/* メインビジュアル */}
      <div className="relative bg-blue-50 border-b-2 border-blue-200 py-12">
        <div className="container mx-auto max-w-7xl px-6 text-center">
          <h1 className="mb-2 text-blue-800">今日はどの事件を解く？</h1>
          <p className="text-lg text-blue-700">真実を追い求めるあなたのためのマーダーミステリーポータルサイト</p>
        </div>
      </div>

      {/* 検索バー */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto max-w-7xl px-6 py-3">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <Input
              placeholder="シナリオ名、作者、ジャンルで検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-6">
              <TabsTrigger value="lineup">ラインナップ</TabsTrigger>
              <TabsTrigger value="calendar">カレンダー</TabsTrigger>
              <TabsTrigger value="list">リスト</TabsTrigger>
            </TabsList>
            
            {/* ラインナップ表示 */}
            <TabsContent value="lineup" className="space-y-8">
            {/* 新着公演セクション */}
            {getNewScenarios().length > 0 && (
              <section>
                <h2 className="mb-4 flex items-center gap-2">
                  <span>新着公演</span>
                  <Badge className="bg-red-600 text-white border-0 text-xs px-2 py-0.5 rounded-sm">NEW</Badge>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getNewScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            )}

            {/* 直近公演セクション */}
            {getUpcomingScenarios().length > 0 && (
              <section>
                <h2 className="mb-4">直近公演</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getUpcomingScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            )}

            {/* 全タイトルセクション */}
            {getAllScenarios().length > 0 ? (
              <section>
                <h2 className="mb-4">全タイトル</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {getAllScenarios().map((scenario) => (
                    <ScenarioCard key={scenario.scenario_id} scenario={scenario} onClick={handleCardClick} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">シナリオが見つかりませんでした</p>
              </div>
            )}
            </TabsContent>
            
            {/* カレンダー表示 */}
            <TabsContent value="calendar">
              {/* 月選択と店舗フィルター */}
              <div className="flex items-center justify-between mb-6 gap-4">
                <button
                  onClick={() => changeMonth('prev')}
                  className="px-4 py-2 rounded border hover:bg-muted transition-colors"
                >
                  ← 前月
                </button>
                <h2 className="">
                  {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
                </h2>
                <button
                  onClick={() => changeMonth('next')}
                  className="px-4 py-2 rounded border hover:bg-muted transition-colors"
                >
                  次月 →
                </button>
                
                {/* 店舗フィルター */}
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="店舗を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべての店舗</SelectItem>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* カレンダーグリッド */}
              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                {/* 曜日ヘッダー（月曜始まり） */}
                <div className="grid grid-cols-7 border-b bg-muted/30">
                  {['月', '火', '水', '木', '金', '土', '日'].map((day, index) => (
                    <div 
                      key={day} 
                      className={`text-center py-3 ${
                        index === 5 ? 'text-blue-600' : index === 6 ? 'text-red-600' : ''
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* 日付グリッド */}
                <div className="grid grid-cols-7">
                  {generateCalendarDays().map((day, index) => {
                    const events = getEventsForDate(day.date)
                    const dateNum = day.date.getDate()
                    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6
                    const isSunday = day.date.getDay() === 0
                    
                    return (
                      <div
                        key={index}
                        className={`border-r border-b ${
                          !day.isCurrentMonth ? 'bg-muted/20' : ''
                        } flex flex-col`}
                      >
                        {/* 日付 */}
                        <div 
                          className={`text-xs p-1 pb-0.5 flex-shrink-0 flex items-center justify-between ${
                            !day.isCurrentMonth 
                              ? 'text-muted-foreground' 
                              : isSunday 
                                ? 'text-red-600' 
                                : isWeekend 
                                  ? 'text-blue-600' 
                                  : ''
                          }`}
                        >
                          <span>{dateNum}</span>
                          {events.length > 4 && (
                            <span className="text-[10px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded-full">
                              +{events.length - 4}
                            </span>
                          )}
                        </div>
                        
                        {/* 公演リスト（スクロール可能） */}
                        <div className="relative space-y-0.5 px-0 pb-0 overflow-y-auto max-h-[250px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                          {events.map((event: any, idx: number) => {
                            const available = (event.max_participants || 8) - (event.current_participants || 0)
                            const isFull = available === 0
                            const storeName = getStoreName(event)
                            const storeColor = getStoreColor(event)
                            
                            return (
                              <div
                                key={idx}
                                onClick={() => {
                                  const scenario = scenarios.find(s => 
                                    s.scenario_id === event.scenario_id || 
                                    s.scenario_title === event.scenario
                                  )
                                  if (scenario) handleCardClick(scenario.scenario_id)
                                }}
                                className="text-xs p-1 rounded-none cursor-pointer hover:shadow-md transition-shadow border-l-2"
                                style={{
                                  borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                                  backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`
                                }}
                              >
                                <div className="flex items-start gap-0">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <div className="truncate text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                        {event.start_time?.slice(0, 5)} {storeName}
                                      </div>
                                      <div className={`text-[11px] leading-tight flex-shrink-0 ml-1 ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                        {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-gray-800 leading-tight truncate">
                                      {event.scenario || event.scenarios?.title}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {/* 下部グラデーション（スクロール可能な場合のみ表示） */}
                          {events.length > 4 && (
                            <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TabsContent>

            {/* リスト表示 */}
            <TabsContent value="list">
              <div className="space-y-4">
                {/* 月ナビゲーション */}
                <div className="flex items-center justify-between">
                  <h2 className="">
                    {listViewMonth.getFullYear()}年{listViewMonth.getMonth() + 1}月
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => changeListViewMonth('prev')}
                      className="px-3 py-1 border rounded hover:bg-gray-50"
                    >
                      前月
                    </button>
                    <button
                      onClick={() => changeListViewMonth('next')}
                      className="px-3 py-1 border rounded hover:bg-gray-50"
                    >
                      次月
                    </button>
                  </div>
                </div>

                {/* 店舗フィルター */}
                <div className="flex items-center gap-4">
                  <label className="text-sm">店舗:</label>
                  <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">すべて</SelectItem>
                      {stores.map(store => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.short_name || store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* リスト表示テーブル */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-20 border-r">日付</TableHead>
                      <TableHead className="w-16 border-r">曜日</TableHead>
                      <TableHead className="w-20 border-r">会場</TableHead>
                      <TableHead style={{ width: '192px' }}>午前 (~12:00)</TableHead>
                      <TableHead style={{ width: '192px' }}>午後 (12:00-17:00)</TableHead>
                      <TableHead style={{ width: '192px' }}>夜間 (17:00~)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generateListViewData().map(({ date, store }, index) => {
                      const events = getEventsForDateStore(date, store.id)
                      const dateObj = new Date(listViewMonth.getFullYear(), listViewMonth.getMonth(), date)
                      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()]
                      
                      // 時間帯別にイベントを分類
                      const morningEvents = events.filter(event => {
                        const hour = parseInt(event.start_time?.split(':')[0] || '0')
                        return hour >= 9 && hour < 12
                      })
                      const afternoonEvents = events.filter(event => {
                        const hour = parseInt(event.start_time?.split(':')[0] || '0')
                        return hour >= 12 && hour < 17
                      })
                      const eveningEvents = events.filter(event => {
                        const hour = parseInt(event.start_time?.split(':')[0] || '0')
                        return hour >= 17
                      })
                      
                      const isFirstRowOfDate = index === 0 || generateListViewData()[index - 1]?.date !== date
                      
                      return (
                        <TableRow key={`${date}-${store.id}`} className={isFirstRowOfDate && index !== 0 ? 'border-t-2 border-gray-300' : ''}>
                          {/* 日付セル */}
                          {isFirstRowOfDate ? (
                            <TableCell className="schedule-table-cell border-r text-sm align-top" rowSpan={stores.filter(s => selectedStoreFilter === 'all' || s.id === selectedStoreFilter).length}>
                              {listViewMonth.getMonth() + 1}/{date}
                            </TableCell>
                          ) : null}
                          
                          {/* 曜日セル */}
                          {isFirstRowOfDate ? (
                            <TableCell className={`schedule-table-cell border-r text-sm align-top ${dayOfWeek === '日' ? 'text-red-600' : dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.filter(s => selectedStoreFilter === 'all' || s.id === selectedStoreFilter).length}>
                              {dayOfWeek}
                            </TableCell>
                          ) : null}
                          
                          {/* 店舗セル */}
                          <TableCell className="schedule-table-cell border-r venue-cell hover:bg-muted/30 transition-colors text-sm">
                            <div className="" style={{ color: getColorFromName(store.color) }}>
                              {store.short_name || store.name}
                            </div>
                          </TableCell>
                          
                          {/* 午前セル */}
                          <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
                            <div className="flex flex-col">
                              {morningEvents.length === 0 ? (
                                <div className="p-2">
                                  <button
                                    className="w-full text-xs py-1.5 px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                    onClick={() => {
                                      // 貸切申し込みボタン - シナリオ選択画面へ遷移
                                      // 日付、店舗、時間帯（午前9:00-12:00）を渡す
                                      window.location.hash = `#private-booking-select?date=${date}&store=${store.id}&slot=morning`
                                    }}
                                  >
                                    貸切申し込み
                                  </button>
                                </div>
                              ) : (
                                morningEvents.map((event: any, idx: number) => {
                                const available = (event.max_participants || 8) - (event.current_participants || 0)
                                const isFull = available === 0
                                const storeColor = getColorFromName(store.color)
                                
                                return (
                                  <div
                                    key={idx}
                                    className="text-xs cursor-pointer hover:shadow-md transition-shadow border-l-2"
                                    style={{
                                      borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                                      backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                                      padding: '4px 6px',
                                      display: 'block'
                                    }}
                                    onClick={() => {
                                      const scenario = scenarios.find((s: any) => 
                                        s.scenario_id === event.scenario_id || 
                                        s.scenario_title === event.scenario
                                      )
                                      if (scenario) handleCardClick(scenario.scenario_id)
                                    }}
                                  >
                                    <div className="flex gap-2">
                                      {/* 左カラム: 画像 */}
                                      <div className="flex-shrink-0 w-[23px] h-[30px] bg-gray-200 overflow-hidden">
                                        {event.scenarios?.image_url ? (
                                          <img 
                                            src={event.scenarios.image_url} 
                                            alt={event.scenario || event.scenarios?.title}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                            No Image
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 右カラム: 情報 */}
                                      <div className="flex flex-col gap-0 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <div className="text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                            {event.start_time?.slice(0, 5)}
                                          </div>
                                          <div className={`text-[11px] leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                            {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                                          </div>
                                        </div>
                                        <div className="text-[11px] leading-tight text-left text-gray-800">
                                          {event.scenario || event.scenarios?.title}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                              )}
                            </div>
                          </TableCell>
                          
                          {/* 午後セル */}
                          <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
                            <div className="flex flex-col">
                              {afternoonEvents.length === 0 ? (
                                <div className="p-2">
                                  <button
                                    className="w-full text-xs py-1.5 px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                    onClick={() => {
                                      window.location.hash = `#private-booking-select?date=${date}&store=${store.id}&slot=afternoon`
                                    }}
                                  >
                                    貸切申し込み
                                  </button>
                                </div>
                              ) : (
                                afternoonEvents.map((event: any, idx: number) => {
                                const available = (event.max_participants || 8) - (event.current_participants || 0)
                                const isFull = available === 0
                                const storeColor = getColorFromName(store.color)
                                
                                return (
                                  <div
                                    key={idx}
                                    className="text-xs cursor-pointer hover:shadow-md transition-shadow border-l-2"
                                    style={{
                                      borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                                      backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                                      padding: '4px 6px',
                                      display: 'block'
                                    }}
                                    onClick={() => {
                                      const scenario = scenarios.find((s: any) => 
                                        s.scenario_id === event.scenario_id || 
                                        s.scenario_title === event.scenario
                                      )
                                      if (scenario) handleCardClick(scenario.scenario_id)
                                    }}
                                  >
                                    <div className="flex gap-2">
                                      {/* 左カラム: 画像 */}
                                      <div className="flex-shrink-0 w-[23px] h-[30px] bg-gray-200 overflow-hidden">
                                        {event.scenarios?.image_url ? (
                                          <img 
                                            src={event.scenarios.image_url} 
                                            alt={event.scenario || event.scenarios?.title}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                            No Image
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 右カラム: 情報 */}
                                      <div className="flex flex-col gap-0 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <div className="text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                            {event.start_time?.slice(0, 5)}
                                          </div>
                                          <div className={`text-[11px] leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                            {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                                          </div>
                                        </div>
                                        <div className="text-[11px] leading-tight text-left text-gray-800">
                                          {event.scenario || event.scenarios?.title}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                              )}
                            </div>
                          </TableCell>
                          
                          {/* 夜間セル */}
                          <TableCell className="schedule-table-cell p-0" style={{ width: '192px' }}>
                            <div className="flex flex-col">
                              {eveningEvents.length === 0 ? (
                                <div className="p-2">
                                  <button
                                    className="w-full text-xs py-1.5 px-2 border border-dashed border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                    onClick={() => {
                                      window.location.hash = `#/scenario-detail?tab=private&preselect=${date}&store=${store.id}&slot=evening`
                                    }}
                                  >
                                    貸切申し込み
                                  </button>
                                </div>
                              ) : (
                                eveningEvents.map((event: any, idx: number) => {
                                const available = (event.max_participants || 8) - (event.current_participants || 0)
                                const isFull = available === 0
                                const storeColor = getColorFromName(store.color)
                                
                                return (
                                  <div
                                    key={idx}
                                    className="text-xs cursor-pointer hover:shadow-md transition-shadow border-l-2"
                                    style={{
                                      borderLeftColor: isFull ? '#9CA3AF' : storeColor,
                                      backgroundColor: isFull ? '#F3F4F6' : `${storeColor}15`,
                                      padding: '4px 6px',
                                      display: 'block'
                                    }}
                                    onClick={() => {
                                      const scenario = scenarios.find((s: any) => 
                                        s.scenario_id === event.scenario_id || 
                                        s.scenario_title === event.scenario
                                      )
                                      if (scenario) handleCardClick(scenario.scenario_id)
                                    }}
                                  >
                                    <div className="flex gap-2">
                                      {/* 左カラム: 画像 */}
                                      <div className="flex-shrink-0 w-[23px] h-[30px] bg-gray-200 overflow-hidden">
                                        {event.scenarios?.image_url ? (
                                          <img 
                                            src={event.scenarios.image_url} 
                                            alt={event.scenario || event.scenarios?.title}
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                            No Image
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* 右カラム: 情報 */}
                                      <div className="flex flex-col gap-0 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <div className="text-[11px] leading-tight" style={{ color: isFull ? '#6B7280' : storeColor }}>
                                            {event.start_time?.slice(0, 5)}
                                          </div>
                                          <div className={`text-[11px] leading-tight ${isFull ? 'text-gray-500' : 'text-gray-600'}`}>
                                            {event.is_private_booking ? '貸切' : isFull ? '満席' : `残${available}席`}
                                          </div>
                                        </div>
                                        <div className="text-[11px] leading-tight text-left text-gray-800">
                                          {event.scenario || event.scenarios?.title}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
