import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Store, 
  Calendar as CalendarIcon, 
  Users, 
  BookOpen, 
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Globe,
  UserCircle,
  HelpCircle
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { staffApi, scheduleApi } from '@/lib/api'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMonths, subMonths, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DashboardHomeProps {
  onPageChange: (pageId: string) => void
}

export function DashboardHome({ onPageChange }: DashboardHomeProps) {
  const { user } = useAuth()
  const [mySchedule, setMySchedule] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [staffName, setStaffName] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // 統計情報を遅延ロード（管理者向け情報として残す）
  const [stats, setStats] = useState({
    stores: 0,
    performances: 0,
    reservations: 0,
    revenue: 0
  })

  // データ取得
  useEffect(() => {
    const fetchMyData = async () => {
      if (!user?.id) return
      
      try {
        setLoading(true)
        // 1. スタッフ情報の取得
        const staff = await staffApi.getByUserId(user.id)
        if (!staff) {
           console.log('スタッフ情報が見つかりません')
           setLoading(false)
           return
        }
        setStaffName(staff.name)

        // 2. スケジュールの取得（表示中の月の前後を含める）
        const startDate = format(startOfMonth(subMonths(currentMonth, 1)), 'yyyy-MM-dd')
        const endDate = format(endOfMonth(addMonths(currentMonth, 1)), 'yyyy-MM-dd')
        
        const events = await scheduleApi.getMySchedule(staff.name, startDate, endDate)
        setMySchedule(events)
      } catch (error) {
        console.error('データ取得エラー:', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchMyData()
  }, [user, currentMonth]) // 月が変わったら再取得

  // スタッフ用実績計算（今月分のみ）
  const myStats = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')

    const thisMonthEvents = mySchedule.filter(event => {
      return event.date >= startStr && event.date <= endStr
    })

    const count = thisMonthEvents.length
    const salary = thisMonthEvents.reduce((sum, event) => {
      const gmCost = event.scenarios?.gm_costs || 0
      return sum + gmCost
    }, 0)

    return { count, salary }
  }, [mySchedule, currentMonth])

  // 統計データ取得（管理者・スタッフ共通で表示しても良いが、優先度は下げる）
  useEffect(() => {
    // モックデータ
    setTimeout(() => {
      setStats({
        stores: 6,
        performances: 42,
        reservations: 128,
        revenue: 1250000
      })
    }, 100)
  }, [])

  // 直近の予定（今日〜7日後まで）
  const upcomingEvents = useMemo(() => {
    // 日付文字列で比較（タイムゾーンの問題を回避）
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const weekLaterStr = format(addDays(today, 7), 'yyyy-MM-dd')
    
    return mySchedule.filter(event => {
      // 今日〜7日後までを表示
      return event.date >= todayStr && event.date <= weekLaterStr
    }).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return a.start_time.localeCompare(b.start_time)
    }).slice(0, 5) // 最大5件まで表示
  }, [mySchedule])

  // カレンダー用の日付生成
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })
    
    // 月の開始日の曜日（0: 日曜日, 1: 月曜日...）
    const startDay = getDay(start)
    
    // 前月の空白を埋めるためのプレースホルダー
    const blanks = Array(startDay).fill(null)
    
    return [...blanks, ...days]
  }, [currentMonth])

  // その日のイベントを取得
  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return mySchedule.filter(event => event.date === dateStr)
  }

  // 選択された日のイベント
  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return []
    return getEventsForDate(selectedDate)
  }, [selectedDate, mySchedule])

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    const events = getEventsForDate(date)
    if (events.length > 0) {
      setIsDetailOpen(true)
    }
  }

  // ナビゲーションメニュー（ロールに応じて表示）
  const navigationTabs = useMemo(() => {
    const commonTabs = [
      { id: 'customer-booking', label: '予約サイト', icon: Globe, color: 'bg-blue-100 text-blue-800' },
      { id: 'schedule', label: 'スケジュール', icon: CalendarIcon, color: 'bg-green-100 text-green-800' },
      { id: 'shift-submission', label: 'シフト提出', icon: Clock, color: 'bg-indigo-100 text-indigo-800' },
      { id: 'gm-availability', label: 'GM確認', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
      { id: 'staff-profile', label: '担当作品', icon: UserCircle, color: 'bg-pink-100 text-pink-800' },
      { id: 'manual', label: 'マニュアル', icon: HelpCircle, color: 'bg-gray-100 text-gray-800' },
    ]
    
    const adminTabs = [
      { id: 'reservations', label: '予約管理', icon: CalendarIcon, color: 'bg-red-100 text-red-800' },
      { id: 'scenarios', label: 'シナリオ', icon: BookOpen, color: 'bg-orange-100 text-orange-800' },
      { id: 'staff', label: 'スタッフ', icon: Users, color: 'bg-purple-100 text-purple-800' },
      { id: 'stores', label: '店舗', icon: Store, color: 'bg-teal-100 text-teal-800' },
      { id: 'settings', label: '設定', icon: Settings, color: 'bg-slate-100 text-slate-800' },
    ]
    
    if (user?.role === 'admin') {
      return [...commonTabs, ...adminTabs]
    }
    return commonTabs
  }, [user?.role])

  return (
    <div className="space-y-6 pb-20">
      {/* 1. 直近の出勤予定 */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-muted-foreground">直近の出勤予定</h2>
        </div>
        
        {loading && staffName === '' ? (
          <div className="text-sm text-muted-foreground">読み込み中...</div>
        ) : upcomingEvents.length > 0 ? (
          <div className="bg-muted/30 rounded-lg divide-y divide-border">
            {upcomingEvents.map(event => (
              <div key={event.id} className="px-3 py-2 flex items-center gap-3">
                <div className="text-center flex-shrink-0 w-12">
                  <div className="text-xs text-muted-foreground">
                    {format(parseISO(event.date), 'M/d')}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {format(parseISO(event.date), 'EEE', { locale: ja })}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {event.scenarios?.title || event.scenario}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {event.start_time.slice(0, 5)}〜 @ {event.stores?.name || event.venue}
                  </div>
                </div>
                <div className="flex-shrink-0 text-xs text-muted-foreground">
                  {event.current_participants}名
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-2">
            直近の予定はありません
          </div>
        )}
      </section>

      {/* 2. 今月のスケジュール（カレンダー） */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">マイスケジュール</h2>
          </div>
          <div className="flex items-center gap-1 bg-accent/30 rounded-md p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-20 text-center">
              {format(currentMonth, 'yyyy年M月')}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-3 sm:p-4">
            {/* 曜日ヘッダー */}
            <div className="grid grid-cols-7 mb-2 text-center text-xs text-muted-foreground font-medium">
              <div className="text-red-500">日</div>
              <div>月</div>
              <div>火</div>
              <div>水</div>
              <div>木</div>
              <div>金</div>
              <div className="text-blue-500">土</div>
            </div>
            
            {/* 日付グリッド */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarDays.map((day, index) => {
                if (!day) return <div key={`blank-${index}`} className="aspect-square" />
                
                const dateStr = format(day, 'yyyy-MM-dd')
                const dayEvents = getEventsForDate(day)
                const hasEvent = dayEvents.length > 0
                
                return (
                  <div 
                    key={dateStr}
                    className={`
                      aspect-square rounded-md flex flex-col items-center justify-start pt-1 sm:pt-2 relative border cursor-pointer transition-colors
                      ${isToday(day) ? 'bg-primary/5 border-primary font-bold' : 'border-transparent hover:bg-accent'}
                      ${hasEvent ? 'bg-accent/30' : ''}
                    `}
                    onClick={() => handleDateClick(day)}
                  >
                    <span className={`text-xs sm:text-sm ${getDay(day) === 0 ? 'text-red-500' : getDay(day) === 6 ? 'text-blue-500' : ''}`}>
                      {format(day, 'd')}
                    </span>
                    
                    {/* イベントタイトル */}
                    <div className="flex flex-col gap-0.5 mt-0.5 w-full px-0.5 overflow-hidden">
                      {dayEvents.slice(0, 2).map((e, i) => (
                        <div key={i} className="text-[8px] sm:text-[10px] leading-tight truncate text-primary w-full text-center">
                          {e.scenarios?.title || e.scenario}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[8px] text-muted-foreground text-center">+{dayEvents.length - 2}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. クイックリンク */}
      <section>
        <h2 className="text-lg font-bold mb-3">クイックメニュー</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <Card 
                key={tab.id} 
                className="hover:bg-accent cursor-pointer transition-colors"
                onClick={() => onPageChange(tab.id)}
              >
                <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                  <div className={`p-2 rounded-full ${tab.color.split(' ')[0]} bg-opacity-20`}>
                    <Icon className={`h-5 w-5 ${tab.color.split(' ')[1]}`} />
                  </div>
                  <span className="text-sm font-medium">{tab.label}</span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* 4. スタッフ向け統計情報（出勤数・給与概算）- 全員に表示 */}
      <section className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-muted-foreground">今月の実績（概算）</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 p-3 rounded text-center">
            <div className="text-xs text-muted-foreground mb-1">出勤回数</div>
            <div className="font-bold text-xl">{myStats.count}回</div>
          </div>
          <div className="bg-muted/50 p-3 rounded text-center">
            <div className="text-xs text-muted-foreground mb-1">報酬見込み</div>
            <div className="font-bold text-xl">¥{myStats.salary.toLocaleString()}</div>
          </div>
        </div>
      </section>

      {/* 5. 管理者向け統計情報（控えめに表示） */}
      {user?.role === 'admin' && (
        <section className="pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">管理者用データ</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-muted/50 p-2 rounded text-center">
              <div className="text-xs text-muted-foreground">今月の売上</div>
              <div className="font-bold">¥{stats.revenue.toLocaleString()}</div>
            </div>
            <div className="bg-muted/50 p-2 rounded text-center">
              <div className="text-xs text-muted-foreground">予約件数</div>
              <div className="font-bold">{stats.reservations}件</div>
            </div>
            <div className="bg-muted/50 p-2 rounded text-center">
              <div className="text-xs text-muted-foreground">公演数</div>
              <div className="font-bold">{stats.performances}回</div>
            </div>
            <div className="bg-muted/50 p-2 rounded text-center">
              <div className="text-xs text-muted-foreground">稼働店舗</div>
              <div className="font-bold">{stats.stores}店</div>
            </div>
          </div>
        </section>
      )}

      {/* 日付詳細ダイアログ */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              {selectedDate && format(selectedDate, 'M月d日(EEE)', { locale: ja })}のシフト
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {selectedDateEvents.map((event, i) => (
              <div key={i} className="bg-muted/50 p-4 rounded-lg border">
                <div className="flex items-start justify-between mb-2">
                   <h3 className="font-bold text-lg">{event.scenarios?.title || event.scenario}</h3>
                   <Badge>{event.start_time.slice(0, 5)} - {event.end_time.slice(0, 5)}</Badge>
                </div>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{event.stores?.name || event.venue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>予約: {event.current_participants}名</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
