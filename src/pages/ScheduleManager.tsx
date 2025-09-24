import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { TimeSlotCell } from '@/components/schedule/TimeSlotCell'
import { 
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string
  venue: string
  scenario: string
  gms: string[]
  start_time: string
  end_time: string
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite'
  reservation_info?: string
  notes?: string
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
}



export function ScheduleManager() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedCategory, setSelectedCategory] = useState('all')

  // ハッシュ変更でページ切り替え
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      if (hash && hash !== 'schedule') {
        window.location.href = '/#' + hash
      } else if (!hash) {
        window.location.href = '/'
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 店舗一覧
  const stores = [
    { id: 'takadanobaba', name: '高田馬場店', short_name: '馬場', color: 'blue' },
    { id: 'bekkan1', name: '別館①', short_name: '別館①', color: 'green' },
    { id: 'bekkan2', name: '別館②', short_name: '別館②', color: 'purple' },
    { id: 'okubo', name: '大久保店', short_name: '大久保', color: 'orange' },
    { id: 'otsuka', name: '大塚店', short_name: '大塚', color: 'red' },
    { id: 'omiya', name: '埼玉大宮店', short_name: '埼玉大宮', color: 'amber' }
  ]

  // 公演カテゴリの色設定
  const categoryConfig = {
    open: { label: 'オープン公演', badgeColor: 'bg-blue-100 text-blue-800', cardColor: 'bg-blue-50 border-blue-200' },
    private: { label: '貸切公演', badgeColor: 'bg-purple-100 text-purple-800', cardColor: 'bg-purple-50 border-purple-200' },
    gmtest: { label: 'GMテスト', badgeColor: 'bg-orange-100 text-orange-800', cardColor: 'bg-orange-50 border-orange-200' },
    testplay: { label: 'テストプレイ', badgeColor: 'bg-yellow-100 text-yellow-800', cardColor: 'bg-yellow-50 border-yellow-200' },
    trip: { label: '出張公演', badgeColor: 'bg-green-100 text-green-800', cardColor: 'bg-green-50 border-green-200' }
  }


  // 店舗色取得（店舗識別用）
  const getStoreCardClass = (storeId: string): string => {
    const store = stores.find(s => s.id === storeId)
    if (!store) return 'bg-card border-border'
    
    switch (store.color) {
      case 'blue': return 'bg-blue-50 border-blue-200'
      case 'green': return 'bg-green-50 border-green-200'
      case 'purple': return 'bg-purple-50 border-purple-200'
      case 'orange': return 'bg-orange-50 border-orange-200'
      case 'red': return 'bg-red-50 border-red-200'
      case 'amber': return 'bg-amber-50 border-amber-200'
      default: return 'bg-card border-border'
    }
  }

  // 予約状況によるバッジクラス取得
  const getReservationBadgeClass = (current: number, max: number): string => {
    const ratio = current / max
    if (ratio >= 1) return 'bg-red-100 text-red-800' // 満席
    if (ratio >= 0.8) return 'bg-yellow-100 text-yellow-800' // ほぼ満席
    if (ratio >= 0.5) return 'bg-green-100 text-green-800' // 順調
    return 'bg-gray-100 text-gray-800' // 空きあり
  }

  // 月の変更
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  // 月間の日付リストを生成
  const generateMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days = []
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      days.push({
        date: date.toISOString().split('T')[0],
        dayOfWeek: date.toLocaleDateString('ja-JP', { weekday: 'short' }),
        day: day,
        displayDate: `${month + 1}/${day}`
      })
    }
    return days
  }

  // モックデータ（後でSupabaseから取得）
  const mockEvents: ScheduleEvent[] = [
    {
      id: '1',
      date: '2025-09-01',
      venue: 'takadanobaba',
      scenario: '人狼村の悲劇',
      gms: ['田中太郎'],
      start_time: '14:00',
      end_time: '18:00',
      category: 'private',
      is_cancelled: false,
      participant_count: 6,
      max_participants: 8
    },
    {
      id: '2',
      date: '2025-09-01',
      venue: 'bekkan1',
      scenario: '密室の謎',
      gms: ['山田花子'],
      start_time: '19:00',
      end_time: '22:00',
      category: 'open',
      is_cancelled: false,
      participant_count: 8,
      max_participants: 8
    },
    {
      id: '3',
      date: '2025-09-02',
      venue: 'okubo',
      scenario: '新シナリオ検証',
      gms: ['佐藤次郎', '鈴木三郎'],
      start_time: '10:00',
      end_time: '13:00',
      category: 'gmtest',
      is_cancelled: false
    },
    {
      id: '4',
      date: '2025-09-02',
      venue: 'otsuka',
      scenario: 'テストプレイ用シナリオ',
      gms: ['鈴木三郎'],
      start_time: '15:00',
      end_time: '18:00',
      category: 'testplay',
      is_cancelled: false
    }
  ]

  const monthDays = generateMonthDays()

  // 時間帯判定
  const getTimeSlot = (startTime: string) => {
    const hour = parseInt(startTime.split(':')[0])
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }

  // 特定の日付・店舗・時間帯の公演を取得
  const getEventsForSlot = (date: string, venue: string, timeSlot: 'morning' | 'afternoon' | 'evening') => {
    return mockEvents.filter(event => 
      event.date === date && 
      event.venue === venue && 
      getTimeSlot(event.start_time) === timeSlot
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <NavigationBar currentPage="schedule" />
      
      <div className="container mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* ヘッダー部分 */}
          <div className="flex items-center justify-between">
            <h2>月間スケジュール管理</h2>
            <div className="flex gap-4 items-center">
              {/* 月選択コントロール */}
              <div className="flex items-center gap-2 border rounded-lg p-1">
                <Button variant="ghost" size="sm" onClick={() => changeMonth('prev')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={currentDate.getMonth().toString()} onValueChange={(value) => {
                  const newDate = new Date(currentDate)
                  newDate.setMonth(parseInt(value))
                  setCurrentDate(newDate)
                }}>
                  <SelectTrigger className="w-32 border-0 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {new Date(2025, i).toLocaleDateString('ja-JP', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => changeMonth('next')}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* カテゴリタブ */}
          <div className="bg-card border rounded-lg p-4">
            <h3>公演カテゴリ</h3>
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mt-4">
              <TabsList className="grid grid-cols-6 w-fit gap-1">
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  すべて
                </TabsTrigger>
                <TabsTrigger value="open" className="bg-blue-100 text-blue-800 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900">
                  オープン公演
                </TabsTrigger>
                <TabsTrigger value="private" className="bg-purple-100 text-purple-800 data-[state=active]:bg-purple-200 data-[state=active]:text-purple-900">
                  貸切公演
                </TabsTrigger>
                <TabsTrigger value="gmtest" className="bg-orange-100 text-orange-800 data-[state=active]:bg-orange-200 data-[state=active]:text-orange-900">
                  GMテスト
                </TabsTrigger>
                <TabsTrigger value="testplay" className="bg-yellow-100 text-yellow-800 data-[state=active]:bg-yellow-200 data-[state=active]:text-yellow-900">
                  テストプレイ
                </TabsTrigger>
                <TabsTrigger value="trip" className="bg-green-100 text-green-800 data-[state=active]:bg-green-200 data-[state=active]:text-green-900">
                  出張公演
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* メインカード・テーブル */}
          <Card>
            <CardHeader className="bg-muted/30 border-b border-border">
              <CardTitle>リストカレンダー - {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月</CardTitle>
              <CardDescription className="text-muted-foreground">
                ※公演のタイトルが未決定の場合、当該公演は薄い色で警告表示されます<br/>
                ※シナリオやGMが未定の場合は赤い色で警告表示されます
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-20 border-r">日付</TableHead>
                    <TableHead className="w-16 border-r">曜日</TableHead>
                    <TableHead className="w-20 border-r">会場</TableHead>
                    <TableHead>午前 (~12:00)</TableHead>
                    <TableHead>午後 (12:00-17:00)</TableHead>
                    <TableHead>夜間 (17:00~)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthDays.slice(0, 10).map(day => {
                    return stores.map((store, storeIndex) => (
                      <TableRow key={`${day.date}-${store.id}`} className="hover:bg-muted/50">
                        {/* 日付セル */}
                        {storeIndex === 0 ? (
                          <TableCell className="schedule-table-cell border-r" rowSpan={stores.length}>
                            {day.displayDate}
                          </TableCell>
                        ) : null}
                        
                        {/* 曜日セル */}
                        {storeIndex === 0 ? (
                          <TableCell className={`schedule-table-cell border-r ${day.dayOfWeek === '日' ? 'text-red-600' : day.dayOfWeek === '土' ? 'text-blue-600' : ''}`} rowSpan={stores.length}>
                            {day.dayOfWeek}
                          </TableCell>
                        ) : null}
                        
                        {/* 店舗セル */}
                        <TableCell className="schedule-table-cell border-r">
                          {store.short_name}
                        </TableCell>
                        
                        {/* 午前セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'morning')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="morning"
                          getStoreCardClass={getStoreCardClass}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancel={(event) => {
                            // TODO: openCancelDialog(event);
                          }}
                          onUncancel={(event) => {
                            // TODO: uncancelEvent(event);
                          }}
                          onAddPerformance={(date, venue, timeSlot) => {
                            // TODO: openAddPerformanceDialog(date, venue, timeSlot);
                          }}
                        />
                        
                        {/* 午後セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'afternoon')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="afternoon"
                          getStoreCardClass={getStoreCardClass}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancel={(event) => {
                            // TODO: openCancelDialog(event);
                          }}
                          onUncancel={(event) => {
                            // TODO: uncancelEvent(event);
                          }}
                          onAddPerformance={(date, venue, timeSlot) => {
                            // TODO: openAddPerformanceDialog(date, venue, timeSlot);
                          }}
                        />
                        
                        {/* 夜間セル */}
                        <TimeSlotCell
                          events={getEventsForSlot(day.date, store.id, 'evening')}
                          date={day.date}
                          venue={store.id}
                          timeSlot="evening"
                          getStoreCardClass={getStoreCardClass}
                          categoryConfig={categoryConfig}
                          getReservationBadgeClass={getReservationBadgeClass}
                          onCancel={(event) => {
                            // TODO: openCancelDialog(event);
                          }}
                          onUncancel={(event) => {
                            // TODO: uncancelEvent(event);
                          }}
                          onAddPerformance={(date, venue, timeSlot) => {
                            // TODO: openAddPerformanceDialog(date, venue, timeSlot);
                          }}
                        />
                      </TableRow>
                    ))
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
