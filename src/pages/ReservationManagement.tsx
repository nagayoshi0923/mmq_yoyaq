import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { 
  Calendar, Search, Clock, User, DollarSign, Filter, 
  ChevronDown, Download, TrendingUp, AlertCircle, 
  CalendarDays, Globe, Phone, MonitorCheck, AlertTriangle,
  Link as LinkIcon
} from 'lucide-react'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useReservationData, ReservationWithDetails } from '@/hooks/useReservationData'
import { useReservationStats } from '@/hooks/useReservationStats'
import { format, isPast, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'

// 異常検知ロジック
const getReservationAlerts = (reservation: ReservationWithDetails) => {
  const alerts = []
  const eventDate = reservation.event_date ? new Date(reservation.event_date) : null
  const isEventPast = eventDate && isPast(eventDate)

  // 1. 過去の日付なのに保留中
  if (isEventPast && ['pending', 'pending_gm', 'pending_store'].includes(reservation.status)) {
    alerts.push({ type: 'warning', message: '過去の未処理予約' })
  }

  // 2. 確定済みだがスケジュールIDがない（貸切などでスケジュール連携漏れの可能性）
  // 注: 現状の型定義には schedule_event_id がないため、event_date があるかで簡易判定
  if (reservation.status === 'confirmed' && !reservation.event_date && reservation.reservation_source === 'web_private') {
    alerts.push({ type: 'error', message: '日時未確定の確定予約' })
  }

  // 3. 未払い（キャンセル以外）
  if (reservation.payment_status === 'unpaid' && reservation.status !== 'cancelled') {
    alerts.push({ type: 'payment', message: '未払い' })
  }

  return alerts
}

export function ReservationManagement() {
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set())
  
  // フィルタ状態
  const [searchTerm, setSearchTerm] = useSessionState('reservationSearchTerm', '')
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')
  const [alertFilter, setAlertFilter] = useSessionState('reservationAlertFilter', 'all') // 新規: アラートフィルター
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  // データ取得
  const { reservations, isLoading: isListLoading } = useReservationData({
    searchTerm,
    statusFilter,
    paymentFilter,
    typeFilter
  })

  const { stats, isLoading: isStatsLoading } = useReservationStats()

  useScrollRestoration({ pageKey: 'reservation', isLoading: isListLoading })

  // グルーピングとアラートフィルタリング処理
  const groupedReservations = useMemo(() => {
    // まずアラートフィルターを適用
    let filtered = reservations
    if (alertFilter === 'alert_only') {
      filtered = reservations.filter(r => getReservationAlerts(r).length > 0)
    }

    // 日付でグループ化
    const groups: Record<string, ReservationWithDetails[]> = {}
    const noDateGroup: ReservationWithDetails[] = []

    filtered.forEach(r => {
      if (r.event_date && isValid(new Date(r.event_date))) {
        const dateKey = r.event_date
        if (!groups[dateKey]) groups[dateKey] = []
        groups[dateKey].push(r)
      } else {
        noDateGroup.push(r)
      }
    })

    // 日付順にソート（降順: 新しい日付が上）
    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

    return { sortedDates, groups, noDateGroup }
  }, [reservations, alertFilter])

  // UIヘルパー関数群
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline', className?: string }> = {
      confirmed: { label: '確定', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
      pending: { label: '保留', variant: 'secondary', className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' },
      cancelled: { label: 'キャンセル', variant: 'destructive' },
      pending_gm: { label: 'GM確認待ち', variant: 'secondary', className: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
      gm_confirmed: { label: 'GM確定', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
      pending_store: { label: '店舗確認待ち', variant: 'secondary', className: 'bg-purple-100 text-purple-800 hover:bg-purple-200' }
    }
    const config = statusConfig[status] || { label: status, variant: 'outline' }
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
  }

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'web':
      case 'web_private':
        return <Globe className="h-4 w-4 text-blue-500" />
      case 'phone':
        return <Phone className="h-4 w-4 text-green-500" />
      case 'walk_in':
        return <User className="h-4 w-4 text-orange-500" />
      default:
        return <MonitorCheck className="h-4 w-4 text-gray-500" />
    }
  }

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      web: 'Web予約',
      web_private: '貸切リクエスト',
      phone: '電話予約',
      walk_in: '当日',
      external: '外部'
    }
    return labels[source] || source
  }

  const toggleExpanded = (id: string) => {
    setExpandedReservations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  const isLoading = isListLoading || isStatsLoading

  if (isLoading) {
    return (
      <AppLayout currentPage="reservations">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground text-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            読み込み中...
          </p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-2 py-2 sm:px-4 sm:py-4" className="mx-auto">
      <div className="space-y-3 sm:space-y-4">
        <PageHeader
          className="!mb-2"
          title={
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">予約確認・照合</span>
            </div>
          }
          description="予約データとスケジュールの整合性を確認します"
        >
          <HelpButton topic="reservation" label="予約管理マニュアル" />
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Download className="mr-2 h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV出力</span>
            <span className="sm:hidden">CSV</span>
          </Button>
        </PageHeader>

        {/* 統計サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="bg-card/50 relative overflow-hidden shadow-sm">
             <div className="absolute top-0 right-0 p-1.5 opacity-10"><TrendingUp className="w-8 h-8" /></div>
            <CardContent className="p-2.5 sm:p-3">
              <div className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> 今月の予約</div>
              <div className="flex items-baseline gap-1.5"><div className="text-xl sm:text-2xl font-bold">{stats.monthlyTotal}</div><div className="text-[10px] text-muted-foreground">件</div></div>
              <div className="text-[10px] text-muted-foreground mt-0.5">見込: ¥{stats.monthlyRevenue.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-green-50/50 border-green-100 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1.5 opacity-10"><Clock className="w-8 h-8 text-green-600" /></div>
            <CardContent className="p-2.5 sm:p-3">
              <div className="text-[10px] sm:text-xs text-green-700 mb-0.5 font-medium">確定済み（全期間）</div>
              <div className="flex items-baseline gap-1.5"><div className="text-xl sm:text-2xl font-bold text-green-700">{stats.confirmed}</div><div className="text-[10px] text-green-600/70">件</div></div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50/50 border-yellow-100 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1.5 opacity-10"><AlertCircle className="w-8 h-8 text-yellow-600" /></div>
            <CardContent className="p-2.5 sm:p-3">
              <div className="text-[10px] sm:text-xs text-yellow-700 mb-0.5 font-medium">要対応（保留・確認待）</div>
              <div className="flex items-baseline gap-1.5"><div className="text-xl sm:text-2xl font-bold text-yellow-700">{stats.pending}</div><div className="text-[10px] text-yellow-600/70">件</div></div>
            </CardContent>
          </Card>
          <Card className="bg-red-50/50 border-red-100 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-1.5 opacity-10"><DollarSign className="w-8 h-8 text-red-600" /></div>
            <CardContent className="p-2.5 sm:p-3">
              <div className="text-[10px] sm:text-xs text-red-700 mb-0.5 font-medium">未払い</div>
              <div className="flex items-baseline gap-1.5"><div className="text-xl sm:text-2xl font-bold text-red-700">{stats.unpaid}</div><div className="text-[10px] text-red-600/70">件</div></div>
            </CardContent>
          </Card>
        </div>

        {/* フィルター＆検索 */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="予約番号、顧客名、シナリオ名で検索..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Button variant="outline" onClick={() => setIsFilterOpen(!isFilterOpen)} className={`h-9 text-xs sm:w-auto w-full flex items-center justify-center gap-2 ${alertFilter !== 'all' ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : ''}`}>
            <Filter className="h-3.5 w-3.5" />
            {alertFilter !== 'all' ? '要確認のみ' : 'フィルター'}
            {(statusFilter !== 'all' || paymentFilter !== 'all' || typeFilter !== 'all' || alertFilter !== 'all') && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">!</Badge>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {isFilterOpen && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> 要確認アイテム</Label>
                <Select value={alertFilter} onValueChange={setAlertFilter}>
                  <SelectTrigger className="bg-white border-red-200 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて表示</SelectItem>
                    <SelectItem value="alert_only" className="text-red-600 font-medium">要確認のみ（警告あり）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ステータス</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="confirmed">確定</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                    <SelectItem value="cancelled">キャンセル</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">支払い状況</Label>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="paid">支払済</SelectItem>
                    <SelectItem value="unpaid">未払い</SelectItem>
                    <SelectItem value="pending">保留</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">予約ソース</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-background h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="web">Web予約</SelectItem>
                    <SelectItem value="web_private">貸切リクエスト</SelectItem>
                    <SelectItem value="phone">電話予約（手動）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 予約リスト（日付グルーピング） */}
        <div className="space-y-4">
          {groupedReservations.sortedDates.length === 0 && groupedReservations.noDateGroup.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">該当する予約が見つかりませんでした</p>
                <Button variant="link" onClick={() => { setSearchTerm(''); setStatusFilter('all'); setPaymentFilter('all'); setTypeFilter('all'); setAlertFilter('all'); }} className="text-xs">条件をクリア</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 日付未定グループ（あれば先頭に表示） */}
              {groupedReservations.noDateGroup.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-muted-foreground flex items-center gap-2 px-1 text-sm">
                    <CalendarDays className="h-3.5 w-3.5" /> 日付未定 / リクエスト中
                    <Badge variant="outline" className="ml-2 text-[10px] h-4 px-1">{groupedReservations.noDateGroup.length}</Badge>
                  </h3>
                  <div className="grid gap-2">
                    {groupedReservations.noDateGroup.map(reservation => (
                      <ReservationCard key={reservation.id} reservation={reservation} isExpanded={expandedReservations.has(reservation.id)} toggleExpanded={toggleExpanded} getStatusBadge={getStatusBadge} getSourceIcon={getSourceIcon} getSourceLabel={getSourceLabel} />
                    ))}
                  </div>
                </div>
              )}

              {/* 日付別グループ */}
              {groupedReservations.sortedDates.map(dateKey => (
                <div key={dateKey} className="space-y-2">
                  <h3 className={`font-bold flex items-center gap-2 px-1 sticky top-[56px] z-10 py-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b w-full text-sm ${isPast(new Date(dateKey)) ? 'text-muted-foreground' : 'text-foreground'}`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {/* @ts-ignore */}
                    {format(new Date(dateKey), 'yyyy年M月d日 (EEE)', { locale: ja })}
                    <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">{groupedReservations.groups[dateKey].length}</Badge>
                  </h3>
                  <div className="grid gap-2">
                    {groupedReservations.groups[dateKey].map(reservation => (
                      <ReservationCard key={reservation.id} reservation={reservation} isExpanded={expandedReservations.has(reservation.id)} toggleExpanded={toggleExpanded} getStatusBadge={getStatusBadge} getSourceIcon={getSourceIcon} getSourceLabel={getSourceLabel} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// サブコンポーネント: 予約カード
function ReservationCard({ reservation, isExpanded, toggleExpanded, getStatusBadge, getSourceIcon, getSourceLabel }: any) {
  const alerts = getReservationAlerts(reservation)
  const hasAlerts = alerts.length > 0

  return (
    <Card className={`transition-all duration-200 group ${isExpanded ? 'ring-1 ring-primary/20 shadow-sm' : 'hover:bg-accent/5'} ${hasAlerts ? 'border-l-[3px] border-l-red-500' : 'border-l-[3px] border-l-transparent'}`}>
      <CardContent className="p-0">
        <div className="flex items-stretch cursor-pointer min-h-[60px]" onClick={() => toggleExpanded(reservation.id)}>
          {/* 左側: 時間とソース */}
          <div className="flex flex-col items-center justify-center w-[70px] sm:w-20 flex-shrink-0 bg-muted/10 border-r px-1 py-2 gap-1">
            <div className="font-mono font-bold text-lg leading-none text-foreground/80">
              {reservation.event_time || '--:--'}
            </div>
            <div className="flex flex-col items-center text-[9px] text-muted-foreground leading-none gap-0.5 opacity-80">
              {getSourceIcon(reservation.reservation_source)}
              <span className="truncate max-w-[60px] text-[8px]">{getSourceLabel(reservation.reservation_source)}</span>
            </div>
          </div>

          {/* メイン情報エリア */}
          <div className="flex-1 min-w-0 py-2 px-3 flex flex-col justify-center gap-1">
            {/* 上段: タイトルとステータス */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[9px] text-muted-foreground">#{reservation.reservation_number.slice(-6)}</span>
                  {hasAlerts && (
                    <div className="flex gap-0.5 text-red-500">
                      <AlertTriangle className="h-3 w-3" />
                    </div>
                  )}
                </div>
                <h4 className="font-bold text-sm leading-tight truncate">{reservation.scenario_title}</h4>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                 <div className="scale-90 origin-right">{getStatusBadge(reservation.status)}</div>
              </div>
            </div>

            {/* 下段: 顧客・金額・アラートメッセージ（1行で） */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground overflow-hidden">
              <div className="flex items-center gap-1 text-foreground/80 font-medium truncate max-w-[120px]">
                <User className="h-3 w-3 opacity-70" /> {reservation.customer_name}
              </div>
              <div className="flex items-center gap-1 text-foreground/80">
                <DollarSign className="h-3 w-3 opacity-70" />
                <span className={reservation.payment_status === 'unpaid' ? 'text-red-600 font-medium' : ''}>
                  {(reservation.total_amount || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* 展開アイコン（右端縦中央） */}
          <div className="flex items-center justify-center px-2 text-muted-foreground/50 group-hover:text-foreground transition-colors">
            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* 展開エリア */}
        {isExpanded && (
          <div className="bg-muted/30 border-t px-4 py-3 text-sm animate-in slide-in-from-top-1">
            {hasAlerts && (
              <div className="mb-3 bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-xs">
                <div className="font-bold flex items-center gap-1 mb-1"><AlertTriangle className="h-3 w-3" /> 以下の点を確認してください</div>
                <ul className="list-disc list-inside">{alerts.map((a: any, i: number) => <li key={i}>{a.message}</li>)}</ul>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium text-muted-foreground text-xs mb-1">候補日時 / 備考</h5>
                {reservation.candidate_datetimes?.candidates && (
                  <ul className="list-disc list-inside text-xs text-muted-foreground mb-2">
                    {reservation.candidate_datetimes.candidates.map((c: any, i: number) => (
                      /* @ts-ignore */
                      <li key={i}>{format(new Date(c.date), 'M/d(EEE)', { locale: ja })} {c.startTime}-{c.endTime}</li>
                    ))}
                  </ul>
                )}
                <p className="text-sm">{reservation.customer_notes || <span className="text-muted-foreground italic">備考なし</span>}</p>
              </div>
              <div className="flex flex-col gap-2 items-start sm:items-end justify-end">
                 {/* スケジュール連携ボタン（モック） */}
                 {reservation.event_date && (
                   <Button size="sm" variant="outline" className="w-full sm:w-auto gap-2" onClick={(e) => e.stopPropagation()}>
                     <LinkIcon className="h-3 w-3" /> スケジュールで確認
                   </Button>
                 )}
                 <div className="text-[10px] text-muted-foreground">作成: {/* @ts-ignore */}{format(new Date(reservation.created_at), 'yyyy/MM/dd HH:mm')}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
