import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, Search } from 'lucide-react'
import { scheduleApi, storeApi } from '@/lib/api'
import { logger } from '@/utils/logger'

interface PublicEvent {
  id: string
  date: string
  start_time: string
  end_time: string
  scenario_title: string
  scenario_description?: string
  store_name: string
  store_short_name: string
  store_color?: string
  duration: number
  max_participants: number
  current_participants: number
  available_seats: number
  participation_fee: number
  is_reservation_enabled: boolean
  reservation_deadline_hours: number
}

export function CustomerBookingPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [filteredEvents, setFilteredEvents] = useState<PublicEvent[]>([])
  const [stores, setStores] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // フィルター状態
  const [searchTerm, setSearchTerm] = useState('')
  const [storeFilter, setStoreFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  useEffect(() => {
    loadPublicEvents()
    loadStores()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [events, searchTerm, storeFilter, dateFilter])

  const loadStores = async () => {
    try {
      const data = await storeApi.getAll()
      setStores(data)
    } catch (error) {
      logger.error('店舗データの読み込みエラー:', error)
    }
  }

  const loadPublicEvents = async () => {
    try {
      setIsLoading(true)
      
      // 現在の月から3ヶ月先までの公演を取得
      const currentDate = new Date()
      const events: PublicEvent[] = []
      
      for (let i = 0; i < 3; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        
        const year = targetDate.getFullYear()
        const month = targetDate.getMonth() + 1
        
        const data = await scheduleApi.getByMonth(year, month)
        
        // 予約可能な公演のみをフィルタリング
        const publicEvents = data
          .filter((event: any) => 
            event.is_reservation_enabled && 
            !event.is_cancelled &&
            event.category === 'open' // オープン公演のみ
          )
          .map((event: any) => ({
            id: event.id,
            date: event.date,
            start_time: event.start_time,
            end_time: event.end_time,
            scenario_title: event.scenario || event.scenarios?.title || '未定',
            scenario_description: event.scenarios?.description,
            store_name: event.stores?.name || '',
            store_short_name: event.stores?.short_name || '',
            store_color: event.stores?.color,
            duration: calculateDuration(event.start_time, event.end_time),
            max_participants: event.max_participants || event.capacity || 8,
            current_participants: event.current_participants || 0,
            available_seats: (event.max_participants || event.capacity || 8) - (event.current_participants || 0),
            participation_fee: 3000, // TODO: シナリオから取得
            is_reservation_enabled: event.is_reservation_enabled,
            reservation_deadline_hours: event.reservation_deadline_hours || 24
          }))
        
        events.push(...publicEvents)
      }
      
      // 日付順にソート
      events.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        if (dateCompare !== 0) return dateCompare
        return a.start_time.localeCompare(b.start_time)
      })
      
      setEvents(events)
    } catch (error) {
      logger.error('公演データの読み込みエラー:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const calculateDuration = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)
    return (endHour * 60 + endMin) - (startHour * 60 + startMin)
  }

  const applyFilters = () => {
    let filtered = [...events]

    // 検索フィルター
    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.scenario_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.store_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // 店舗フィルター
    if (storeFilter !== 'all') {
      filtered = filtered.filter(event => event.store_short_name === storeFilter)
    }

    // 日付フィルター
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (dateFilter === 'today') {
      const todayStr = today.toISOString().split('T')[0]
      filtered = filtered.filter(event => event.date === todayStr)
    } else if (dateFilter === 'week') {
      const weekLater = new Date(today)
      weekLater.setDate(today.getDate() + 7)
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date)
        return eventDate >= today && eventDate <= weekLater
      })
    } else if (dateFilter === 'month') {
      const monthLater = new Date(today)
      monthLater.setMonth(today.getMonth() + 1)
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.date)
        return eventDate >= today && eventDate <= monthLater
      })
    }

    setFilteredEvents(filtered)
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[date.getDay()]})`
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const handleBooking = (event: PublicEvent) => {
    // TODO: 予約フォームへ遷移
    logger.log('予約:', event)
    alert(`「${event.scenario_title}」の予約機能は実装中です`)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="customer-booking" />

      <div className="container mx-auto max-w-7xl px-8 py-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">公演予約</h1>
            <p className="text-muted-foreground mt-1">
              予約可能な公演から選んで予約できます
            </p>
          </div>

          {/* 検索・フィルターセクション */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">公演を探す</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 検索 */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="シナリオ名で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* 店舗フィルター */}
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="すべての店舗" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての店舗</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.short_name}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 日付フィルター */}
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="すべての日程" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての日程</SelectItem>
                    <SelectItem value="today">本日</SelectItem>
                    <SelectItem value="week">1週間以内</SelectItem>
                    <SelectItem value="month">1ヶ月以内</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 公演一覧 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">公演情報を読み込み中...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">条件に合う公演が見つかりませんでした</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {filteredEvents.length}件の公演が見つかりました
              </p>
              
              {filteredEvents.map((event) => (
                <Card key={event.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* 日付・時間 */}
                      <div className="md:col-span-3 flex flex-col items-start justify-center border-l-4 pl-4" style={{ borderColor: event.store_color || '#3B82F6' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-bold text-lg">{formatDate(event.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="font-medium">
                            {formatTime(event.start_time)} - {formatTime(event.end_time)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ({event.duration}分)
                        </div>
                      </div>

                      {/* 公演情報 */}
                      <div className="md:col-span-6 space-y-2">
                        <div>
                          <h3 className="text-xl font-bold mb-1">
                            {event.scenario_title}
                          </h3>
                          {event.scenario_description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {event.scenario_description}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 items-center">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span>{event.store_name}</span>
                          </div>
                          
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-500">
                            <Users className="w-3 h-3 mr-1" />
                            残り{event.available_seats}席
                          </Badge>
                          
                          {event.available_seats <= 2 && event.available_seats > 0 && (
                            <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-500">
                              残りわずか
                            </Badge>
                          )}
                          
                          {event.available_seats === 0 && (
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-500">
                              満席
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* 料金・予約ボタン */}
                      <div className="md:col-span-3 flex flex-col items-end justify-center gap-3">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">参加費</p>
                          <p className="text-2xl font-bold text-primary">
                            ¥{event.participation_fee.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">/ 1名</p>
                        </div>
                        
                        <Button
                          onClick={() => handleBooking(event)}
                          disabled={event.available_seats === 0}
                          className="w-full"
                          size="lg"
                        >
                          {event.available_seats === 0 ? '満席' : '予約する'}
                        </Button>
                        
                        <p className="text-xs text-muted-foreground text-right">
                          {event.reservation_deadline_hours}時間前まで予約可
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

