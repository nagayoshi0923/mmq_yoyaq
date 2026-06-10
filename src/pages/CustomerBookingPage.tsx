import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, Search } from 'lucide-react'
import { scheduleApi, storeApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useOrganization } from '@/hooks/useOrganization'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { formatJstMonthDay, getJstWeekdayIndex, toJstYmd } from '@/utils/jstDate'

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

const formatReservationDeadlineLabel = (reservationDeadlineHours: number): string => {
  if (reservationDeadlineHours === 0) return '公演開始まで予約可'
  return `${reservationDeadlineHours}時間前まで予約可`
}

const getTimeSlot = (startTime: string): string => {
  const hour = parseInt(startTime.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

const calculateParticipationFee = async (
  scenarioId: string,
  startTime: string,
  date: string,
  organizationId?: string
): Promise<number> => {
  try {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('participation_fee, participation_costs')
      .eq('id', scenarioId)
    if (organizationId) query = query.eq('organization_id', organizationId)
    const { data: scenario, error } = await query.maybeSingle()
    if (error) { logger.error('シナリオ料金設定取得エラー:', error); return 3000 }
    if (!scenario) return 3000
    let baseFee = scenario.participation_fee || 3000
    if (scenario.participation_costs && scenario.participation_costs.length > 0) {
      const timeSlot = getTimeSlot(startTime)
      const timeSlotCost = scenario.participation_costs.find((cost: { time_slot: string; status: string; type: string; amount: number }) =>
        cost.time_slot === timeSlot && cost.status === 'active'
      )
      if (timeSlotCost) {
        baseFee = timeSlotCost.type === 'percentage'
          ? Math.round(baseFee * (1 + timeSlotCost.amount / 100))
          : timeSlotCost.amount
      }
    }
    return baseFee
  } catch (error) {
    logger.error('料金計算エラー:', error)
    return 3000
  }
}

const isWithinBusinessHours = async (date: string, startTime: string, storeId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('business_hours_settings')
      .select('opening_hours, holidays, time_restrictions')
      .eq('store_id', storeId)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') { logger.error('営業時間設定取得エラー:', error); return false }
    if (!data) return true
    if (data.holidays && data.holidays.includes(date)) return false
    if (data.opening_hours) {
      const dayOfWeek = getJstWeekdayIndex(date) ?? 0
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayHours = data.opening_hours[dayNames[dayOfWeek]]
      if (!dayHours || !dayHours.is_open) return false
      const eventTime = startTime.slice(0, 5)
      if (eventTime < dayHours.open_time || eventTime > dayHours.close_time) return false
    }
    return true
  } catch (error) {
    logger.error('営業時間チェックエラー:', error)
    return false
  }
}

const calculateDuration = (startTime: string, endTime: string): number => {
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  return (endHour * 60 + endMin) - (startHour * 60 + startMin)
}

const formatDate = (dateStr: string): string => formatJstMonthDay(dateStr, true)

const formatTime = (timeStr: string): string => timeStr.slice(0, 5)

export function CustomerBookingPage() {
  const { organization } = useOrganization()
  const bookingBasePath = organization?.slug ? `/${organization.slug}` : ''

  const [searchTerm, setSearchTerm] = useState('')
  const [storeFilter, setStoreFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')

  const { data: stores = [] } = useQuery({
    queryKey: ['customer-booking', 'stores'],
    queryFn: () => storeApi.getAll(),
  })

  const { data: events = [], isLoading } = useQuery<PublicEvent[]>({
    queryKey: ['customer-booking', 'events', organization?.id],
    queryFn: async (): Promise<PublicEvent[]> => {
      const currentDate = new Date()
      const allEvents: PublicEvent[] = []

      for (let i = 0; i < 6; i++) {
        const targetDate = new Date(currentDate)
        targetDate.setMonth(currentDate.getMonth() + i)
        const data = await scheduleApi.getByMonth(targetDate.getFullYear(), targetDate.getMonth() + 1)

        const filteredData = data.filter((event: any) => {
          return !event.is_cancelled &&
            event.is_reservation_enabled !== false &&
            (event.category === 'open' || event.category === 'offsite')
        })

        for (const event of filteredData) {
          const e = event as any
          const isWithinHours = await isWithinBusinessHours(e.date, e.start_time, e.store_id)
          if (isWithinHours) {
            allEvents.push({
              id: e.id,
              date: e.date,
              start_time: e.start_time,
              end_time: e.end_time,
              scenario_title: e.scenario || e.scenario_masters?.title || '未定',
              scenario_description: undefined,
              store_name: e.stores?.name || '',
              store_short_name: e.stores?.short_name || '',
              store_color: e.stores?.color,
              duration: calculateDuration(e.start_time, e.end_time),
              max_participants: e.max_participants || e.capacity || 8,
              current_participants: e.current_participants || 0,
              available_seats: (e.max_participants || e.capacity || 8) - (e.current_participants || 0),
              participation_fee: await calculateParticipationFee(e.scenario_master_id, e.start_time, e.date, organization?.id),
              is_reservation_enabled: e.is_reservation_enabled,
              reservation_deadline_hours: e.reservation_deadline_hours ?? 0,
            })
          }
        }
      }

      allEvents.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date)
        return dateCompare !== 0 ? dateCompare : a.start_time.localeCompare(b.start_time)
      })
      return allEvents
    },
  })

  const extractRegionFromAddress = (address?: string): string => {
    if (!address) return 'その他'
    const match = address.match(/^(東京都|大阪府|京都府|北海道|.{2,3}県)/)
    return match ? match[1] : 'その他'
  }

  const filteredStores = useMemo(() => {
    return stores.filter((s: any) => {
      const name = s.short_name || s.name || ''
      return !(s.ownership_type === 'office' || name.includes('オフィス')) &&
             !(s.ownership_type === 'temporary' || name.includes('臨時'))
    })
  }, [stores])

  const storesByRegion = useMemo(() => {
    const groups = new Map<string, any[]>()
    const sortedStores = [...filteredStores].sort((a: any, b: any) =>
      (a.display_order || 999) - (b.display_order || 999)
    )
    sortedStores.forEach((store: any) => {
      const region = store.region || extractRegionFromAddress(store.address) || 'その他'
      if (!groups.has(region)) groups.set(region, [])
      groups.get(region)!.push(store)
    })
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'その他') return 1
      if (b === 'その他') return -1
      return a.localeCompare(b)
    })
  }, [filteredStores])

  const filteredEvents = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let result = events.filter(event => new Date(event.date) >= today)

    if (searchTerm) {
      result = result.filter(event =>
        event.scenario_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.store_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    if (storeFilter !== 'all') {
      result = result.filter(event => event.store_short_name === storeFilter)
    }
    if (dateFilter === 'today') {
      const todayStr = toJstYmd(today)
      result = result.filter(event => event.date === todayStr)
    } else if (dateFilter === 'week') {
      const weekLater = new Date(today)
      weekLater.setDate(today.getDate() + 7)
      result = result.filter(event => new Date(event.date) <= weekLater)
    } else if (dateFilter === 'month') {
      const monthLater = new Date(today)
      monthLater.setMonth(today.getMonth() + 1)
      result = result.filter(event => new Date(event.date) <= monthLater)
    }
    return result
  }, [events, searchTerm, storeFilter, dateFilter])

  const handleBooking = (event: PublicEvent) => {
    logger.log('予約:', event)
    showToast.info(`「${event.scenario_title}」の予約機能は実装中です`)
  }

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      <div className="container mx-auto max-w-7xl px-[10px] py-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-lg tracking-tight">公演予約</h1>
            <p className="text-muted-foreground mt-1">
              予約可能な公演から選んで予約できます
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">公演を探す</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="シナリオ名で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="すべての店舗" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべての店舗</SelectItem>
                    {storesByRegion.map(([region, regionStores]) => (
                      <SelectGroup key={region}>
                        <SelectLabel className="text-xs text-muted-foreground">{region}</SelectLabel>
                        {regionStores.map((store: any) => (
                          <SelectItem key={store.id} value={store.short_name}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>

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
              <p className="text-xs text-muted-foreground">
                {filteredEvents.length}件の公演が見つかりました
              </p>

              {filteredEvents.map((event) => (
                <Card key={event.id} className="hover:bg-accent/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-3 flex flex-col items-start justify-center border-l-4 pl-4" style={{ borderColor: event.store_color || '#3B82F6' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-lg">{formatDate(event.date)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span className="">{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">({event.duration}分)</div>
                      </div>

                      <div className="md:col-span-6 space-y-2">
                        <div>
                          <h3 className="text-base mb-1">{event.scenario_title}</h3>
                          {event.scenario_description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{event.scenario_description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span>{event.store_name}</span>
                          </div>
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-500">
                            <Users className="w-3 h-3 mr-1" />
                            残り{event.available_seats}席
                          </Badge>
                          {event.available_seats <= 3 && event.available_seats > 0 && (
                            <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-500">残りわずか</Badge>
                          )}
                          {event.available_seats === 0 && (
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-500">満席</Badge>
                          )}
                        </div>
                      </div>

                      <div className="md:col-span-3 flex flex-col items-end justify-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">参加費</p>
                          <p className="text-lg text-primary">¥{event.participation_fee.toLocaleString()}</p>
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
                          {formatReservationDeadlineLabel(event.reservation_deadline_hours)}
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
