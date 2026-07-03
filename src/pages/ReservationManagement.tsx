import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganization } from '@/hooks/useOrganization'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { TanStackDataTable, type Column } from '@/components/patterns/table'
import { SearchInput, FilterBar, FilterSelect } from '@/components/patterns/filter'
import { EmptyState, ListSkeleton } from '@/components/patterns/list'
import { ReservationStatusBadge } from '@/components/patterns/status/ReservationStatusBadge'
import {
  Ticket, Search, Download, FileText, X, Mail, ExternalLink
} from 'lucide-react'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSessionState } from '@/hooks/useSessionState'
import { useReportRouteScrollRestoration } from '@/contexts/RouteScrollRestorationContext'
import { useReservationData, ReservationWithDetails } from '@/hooks/useReservationData'
import { useReservationStats } from '@/hooks/useReservationStats'
import { devDb } from '@/components/ui/DevField'
import { format, isPast } from '@/lib/dateFns'
import { ja } from 'date-fns/locale'
import { RESERVATION_SOURCE } from '@/lib/constants'

// 支払い方法を日本語に変換
const formatPaymentMethod = (method: string | null | undefined): string => {
  switch (method) {
    case 'onsite': return '現地決済'
    case 'online': return '事前決済'
    case 'staff': return 'スタッフ'
    default: return method || '現地決済'
  }
}

// 異常検知ロジック
const getReservationAlerts = (reservation: ReservationWithDetails) => {
  const alerts = []
  const eventDate = reservation.event_date ? new Date(reservation.event_date) : null
  const isEventPast = eventDate && isPast(eventDate)

  if (isEventPast && ['pending', 'pending_gm', 'pending_store'].includes(reservation.status)) {
    alerts.push({ type: 'warning', message: '過去の未処理予約' })
  }
  if (reservation.status === 'confirmed' && !reservation.event_date && reservation.reservation_source === RESERVATION_SOURCE.WEB_PRIVATE) {
    alerts.push({ type: 'error', message: '日時未確定の確定予約' })
  }
  if (reservation.payment_status === 'unpaid' && reservation.status !== 'cancelled') {
    alerts.push({ type: 'payment', message: '未払い' })
  }
  return alerts
}

export function ReservationManagement() {
  const [selectedReservation, setSelectedReservation] = useState<ReservationWithDetails | null>(null)
  const navigate = useNavigate()
  const { organization } = useOrganization()

  // ページング
  const PAGE_SIZE = 50
  const [page, setPage] = useSessionState('reservationListPage', 1)
  
  // フィルタ状態
  const [searchInput, setSearchInput] = useSessionState('reservationSearchTerm', '')
  const [searchTerm, setSearchTerm] = useState(searchInput)
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')
  const [alertFilter, setAlertFilter] = useSessionState('reservationAlertFilter', 'all')

  // 検索入力のデバウンス（400ms待ってから検索実行）
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchInput)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // フィルタ変更時は1ページ目に戻す
  useEffect(() => {
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, paymentFilter, typeFilter, alertFilter])

  // データ取得
  const { reservations, totalCount, isLoading: isListLoading } = useReservationData(
    { searchTerm, statusFilter, paymentFilter, typeFilter },
    { page, pageSize: PAGE_SIZE }
  )

  const { stats, isLoading: isStatsLoading } = useReservationStats()

  useReportRouteScrollRestoration('reservation-management', { isLoading: isListLoading })

  // フィルタリングとソート
  const filteredReservations = reservations.filter(r => {
    if (alertFilter === 'alert_only') {
      return getReservationAlerts(r).length > 0
    }
    return true
  })

  // created_at の形式揺れ（"YYYY-MM-DD HH:mm:ss+00" 等）でも並び替えが壊れないようにする
  const toEpochMs = (value: string | null | undefined): number => {
    if (!value) return 0
    const normalized = value.includes('T') ? value : value.replace(' ', 'T')
    const ms = Date.parse(normalized)
    return Number.isFinite(ms) ? ms : 0
  }

  const sortedReservations = [...filteredReservations].sort((a, b) => {
    const dateA = toEpochMs(a.created_at)
    const dateB = toEpochMs(b.created_at)
    return dateB - dateA // 新しい順（降順）
  })

  // モバイル用グルーピング (予約受付日ベース)
  const groupedReservations = sortedReservations.reduce((acc, r) => {
    // created_at がない場合は 'undecided'
    const dateKey = r.created_at
      ? (r.created_at.includes('T') ? r.created_at.split('T')[0] : r.created_at.split(' ')[0])
      : 'undecided'
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(r)
    return acc
  }, {} as Record<string, ReservationWithDetails[]>)
  
  const sortedDates = Object.keys(groupedReservations).sort((a, b) => {
    if (a === 'undecided') return -1
    if (b === 'undecided') return 1
    return new Date(b).getTime() - new Date(a).getTime()
  })

  const isLoading = isListLoading || isStatsLoading

  // テーブルカラム定義
  const tableColumns: Column<ReservationWithDetails>[] = useMemo(() => [
    {
      key: 'reservation_number',
      header: '予約番号',
      width: 'w-[110px]',
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground" {...devDb('reservations.reservation_number')}>
          {r.reservation_number || '-'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: '受付日時',
      width: 'w-[120px]',
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground text-sm">
            {/* @ts-ignore */}
            {r.created_at ? format(new Date(r.created_at), 'yyyy/MM/dd') : '-'}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {/* @ts-ignore */}
            {r.created_at ? format(new Date(r.created_at), 'HH:mm') : ''}
          </span>
        </div>
      ),
      sortValue: (r) => r.created_at ?? '',
    },
    {
      key: 'event_date',
      header: '公演日時',
      width: 'w-[130px]',
      sortable: true,
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-foreground">
            {r.event_date ? format(new Date(r.event_date), 'yyyy/MM/dd') : '未定'}
          </span>
          <span className="text-xs text-muted-foreground font-mono">{r.event_time || '--:--'}</span>
        </div>
      ),
      sortValue: (r) => `${r.event_date ?? ''} ${r.event_time ?? ''}`,
    },
    {
      key: 'status',
      header: 'ステータス',
      width: 'w-[110px]',
      render: (r) => (
        <div className="flex flex-col">
          <ReservationStatusBadge status={r.status} />
          {r.status === 'cancelled' && (r.cancelled_at || r.updated_at) && (
            <span className="text-xs text-muted-foreground/70 mt-0.5">
              {/* @ts-ignore */}
              {format(new Date(r.cancelled_at || r.updated_at), 'MM/dd HH:mm')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'customer_name',
      header: '顧客名',
      width: 'w-[140px]',
      render: (r) => (
        <div className="font-medium text-primary truncate" {...devDb('reservations.customer_name')}>
          {r.customer_name}
        </div>
      ),
    },
    {
      key: 'scenario_title',
      header: '予約ページ',
      width: 'w-[180px]',
      render: (r) => (
        <div className="text-sm text-primary font-medium truncate" title={r.scenario_title}>
          【{r.scenario_title}】
        </div>
      ),
    },
    {
      key: 'staff',
      header: 'スタッフ',
      width: 'w-[80px]',
      render: () => <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'payment',
      header: 'お支払い',
      width: 'w-[110px]',
      render: (r) => (
        <div className="flex flex-col text-xs">
          <span className="text-foreground" {...devDb('reservations.payment_method')}>
            {formatPaymentMethod(r.payment_method)}
          </span>
          <span
            className={r.payment_status === 'unpaid' ? 'text-red-600 font-bold' : 'text-muted-foreground'}
            {...devDb('reservations.total_amount')}
          >
            ¥{(r.total_amount || 0).toLocaleString()}
          </span>
        </div>
      ),
    },
    {
      key: 'notes',
      header: '予約メモ',
      width: 'w-[70px]',
      align: 'center',
      render: (r) =>
        r.customer_notes ? (
          <FileText className="h-4 w-4 text-muted-foreground mx-auto" />
        ) : (
          <span className="text-muted-foreground/70">-</span>
        ),
    },
    {
      key: 'detail',
      header: '詳細',
      width: 'w-[100px]',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary/80 h-8 text-xs"
          onClick={() => setSelectedReservation(r)}
        >
          予約詳細
        </Button>
      ),
    },
  ], [])

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE))
  const clampedPage = Math.min(Math.max(1, page), totalPages)
  const startIndex = totalCount === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(clampedPage * PAGE_SIZE, totalCount || 0)

  if (isLoading) {
    return (
      <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6" className="mx-auto">
        <div className="space-y-6">
          <PageHeader
            title={<><Ticket className="h-5 w-5 text-primary" />予約一覧</>}
            description="予約状況の確認と管理"
          />
          <div className="hidden md:block">
            <ListSkeleton rows={10} variant="table" />
          </div>
          <div className="md:hidden">
            <ListSkeleton rows={6} variant="card" />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6" className="mx-auto">
      <div className="space-y-6">
        <PageHeader
          title={<><Ticket className="h-5 w-5 text-primary" />予約一覧</>}
          description="予約状況の確認と管理"
        >
          <HelpButton topic="reservation" label="予約管理マニュアル" />
          <Button variant="default" size="sm" className="h-9 text-xs">
            <span className="mr-1 text-lg leading-none">+</span> 追加
          </Button>
        </PageHeader>

        {/* 統計サマリー (影なし・フラットデザイン) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white border shadow-none"><CardContent className="p-4"><div className="text-xs text-muted-foreground">今月の予約</div><div className="text-2xl font-bold" {...devDb('reservations.filter(this_month).count()')}>{stats.monthlyTotal}</div></CardContent></Card>
          <Card className="bg-white border shadow-none"><CardContent className="p-4"><div className="text-xs text-green-600">確定済み</div><div className="text-2xl font-bold text-green-700" {...devDb('reservations.filter(status=confirmed).count()')}>{stats.confirmed}</div></CardContent></Card>
          <Card className="bg-white border shadow-none"><CardContent className="p-4"><div className="text-xs text-yellow-600">要対応</div><div className="text-2xl font-bold text-yellow-700" {...devDb('reservations.filter(status=pending).count()')}>{stats.pending}</div></CardContent></Card>
          <Card className="bg-white border shadow-none"><CardContent className="p-4"><div className="text-xs text-red-600">未払い</div><div className="text-2xl font-bold text-red-700" {...devDb('reservations.filter(payment=unpaid).count()')}>{stats.unpaid}</div></CardContent></Card>
        </div>

        {/* フィルター＆検索 */}
        <FilterBar>
          <SearchInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="予約番号、顧客名、シナリオ名で検索..."
            containerClassName="flex-1 min-w-[240px] max-w-md"
          />
          <FilterSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-[130px]"
            options={[
              { value: 'all', label: 'ステータス: すべて' },
              { value: 'confirmed', label: '確定' },
            ]}
          />
          <FilterSelect
            value={paymentFilter}
            onValueChange={setPaymentFilter}
            className="w-[120px]"
            options={[
              { value: 'all', label: '支払い: すべて' },
              { value: 'unpaid', label: '未払い' },
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onValueChange={setTypeFilter}
            className="w-[120px]"
            options={[
              { value: 'all', label: 'ソース: すべて' },
              { value: 'web', label: 'Web' },
            ]}
          />
          <FilterSelect
            value={alertFilter}
            onValueChange={setAlertFilter}
            className="w-[120px]"
            options={[
              { value: 'all', label: 'アラート: なし' },
              { value: 'alert_only', label: 'アラートあり' },
            ]}
          />
          <Button variant="outline" size="icon" className="h-8 w-8 bg-white flex-shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        </FilterBar>

        {/* ページネーション */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-mono">{startIndex}-{endIndex}</span>
            <span>/</span>
            <span className="font-mono">{totalCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={clampedPage <= 1}
              onClick={() => setPage(Math.max(1, clampedPage - 1))}
            >
              前へ
            </Button>
            <span className="font-mono">
              {clampedPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={clampedPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, clampedPage + 1))}
            >
              次へ
            </Button>
          </div>
        </div>

        {/* ========================================================================
            PC表示: TanStackDataTable
           ======================================================================== */}
        <div className="hidden md:block">
          <TanStackDataTable
            data={sortedReservations}
            columns={tableColumns}
            getRowKey={(r) => r.id}
            emptyMessage="該当する予約がありません"
          />
        </div>

        {/* ========================================================================
            モバイル表示: PC版のテーブル行をベースにしたコンパクトリスト
           ======================================================================== */}
        <div className="md:hidden space-y-4">
          {sortedDates.length === 0 ? (
            <Card className="border">
              <CardContent className="p-0">
                <EmptyState
                  icon={Search}
                  title="該当する予約がありません"
                />
              </CardContent>
            </Card>
          ) : sortedDates.map(dateKey => (
            <div key={dateKey} className="bg-white border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                <span className="text-sm font-bold text-muted-foreground">
                  {dateKey === 'undecided' ? '受付日不明' :
                   /* @ts-ignore */
                   format(new Date(dateKey), 'yyyy/MM/dd (EEE)', { locale: ja }) + ' 受付'}
                </span>
                <span className="text-xs bg-white px-2 py-0.5 rounded border text-muted-foreground">{groupedReservations[dateKey].length}件</span>
              </div>

              <div className="divide-y">
                {groupedReservations[dateKey].map(reservation => (
                  <div key={reservation.id} className="p-3 hover:bg-gray-50 active:bg-gray-100 transition-colors" onClick={() => setSelectedReservation(reservation)}>
                    {/* 上段: 時間・ステータス・金額 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {/* @ts-ignore */}
                          {reservation.event_date ? format(new Date(reservation.event_date), 'MM/dd') : ''} {reservation.event_time || '--:--'}
                        </span>
                        <ReservationStatusBadge status={reservation.status} />
                        {reservation.status === 'cancelled' && (reservation.cancelled_at || reservation.updated_at) && (
                          <span className="text-xs text-muted-foreground/70">
                            {/* @ts-ignore */}
                            {format(new Date(reservation.cancelled_at || reservation.updated_at), 'MM/dd HH:mm')}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/70 font-mono">#{reservation.reservation_number?.slice(-4) || ''}</span>
                      </div>
                      <div className={`text-sm font-bold ${reservation.payment_status === 'unpaid' ? 'text-red-600' : 'text-foreground'}`}>
                        ¥{(reservation.total_amount || 0).toLocaleString()}
                      </div>
                    </div>

                    {/* 下段: 顧客名・シナリオ名 */}
                    <div className="flex justify-between items-end gap-2">
                      <div className="flex-1 min-w-0 grid gap-0.5">
                        <div className="font-medium text-sm text-primary truncate">{reservation.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate">【{reservation.scenario_title}】</div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary shrink-0">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 予約詳細ダイアログ */}
      <Dialog open={!!selectedReservation} onOpenChange={(open) => !open && setSelectedReservation(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0">
          {selectedReservation && (
            <>
              <div className="p-6 pb-4">
                <DialogHeader className="mb-4">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <DialogTitle className="text-2xl font-bold tracking-tight">予約詳細</DialogTitle>
                      <DialogDescription className="mt-2 text-muted-foreground text-sm font-medium">
                        {/* @ts-ignore */}
                        {selectedReservation.event_date ? format(new Date(selectedReservation.event_date), 'yyyy年MM月dd日 (EEE)', { locale: ja }) : '日付未定'}
                        <span className="mx-2">
                          {selectedReservation.event_time || ''} ~ {selectedReservation.end_time ? selectedReservation.end_time.slice(0, 5) : ''}
                        </span>
                      </DialogDescription>
                      <div className="text-xl font-bold mt-1 text-foreground truncate">{selectedReservation.customer_name}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedReservation(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="閉じる"
                    >
                      <X className="h-6 w-6" />
                    </Button>
                  </div>
                </DialogHeader>

                <div className="space-y-8">
                  {/* 予約情報セクション */}
                  <div>
                    <h4 className="text-lg font-bold mb-4 text-foreground">予約情報</h4>
                    <div className="space-y-0 divide-y border-t border-b">
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">予約番号</div>
                        <div className="flex-1 font-mono text-sm text-foreground">
                          {selectedReservation.reservation_number || '-'}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">予約ページ</div>
                        <div className="flex-1 text-primary font-medium flex items-center gap-2">
                          {selectedReservation.event_date && (
                            <span className="mr-2">
                              {/* @ts-ignore */}
                              {format(new Date(selectedReservation.event_date), 'yyyy/MM/dd', { locale: ja })} {selectedReservation.event_time}
                            </span>
                          )}
                          【{selectedReservation.scenario_title}】
                          {(selectedReservation.scenario_master_id || selectedReservation.scenario_id) && organization?.slug && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-2 h-7 px-2 text-xs"
                              onClick={() => navigate(`/${organization.slug}/scenario/${selectedReservation.scenario_master_id || selectedReservation.scenario_id}`)}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              シナリオ詳細
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">公演日時</div>
                        <div className="flex-1 text-sm text-foreground">
                          {/* @ts-ignore */}
                          {selectedReservation.event_date ? format(new Date(selectedReservation.event_date), 'yyyy年MM月dd日 (EEE)', { locale: ja }) : '未定'}
                          {' '}{selectedReservation.event_time} ~
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">予約受付日時</div>
                        <div className="flex-1 text-sm text-foreground">
                          {/* @ts-ignore */}
                          {selectedReservation.created_at ? format(new Date(selectedReservation.created_at), 'yyyy年MM月dd日 HH:mm', { locale: ja }) : '-'}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">ステータス</div>
                        <div className="flex-1 flex items-center gap-2">
                          <ReservationStatusBadge status={selectedReservation.status} />
                          {selectedReservation.status === 'cancelled' && (selectedReservation.cancelled_at || selectedReservation.updated_at) && (
                            <span className="text-xs text-muted-foreground">
                              {/* @ts-ignore */}
                              {format(new Date(selectedReservation.cancelled_at || selectedReservation.updated_at), 'yyyy/MM/dd HH:mm')} キャンセル
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">チェックイン</div>
                        <div className="flex-1">
                          <Button variant="outline" size="sm">
                            チェックイン
                          </Button>
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">お支払い</div>
                        <div className="flex-1 text-sm text-foreground">{formatPaymentMethod(selectedReservation.payment_method)}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">予約者名</div>
                        <div className="flex-1 text-sm text-foreground">{selectedReservation.customer_name}</div>
                      </div>
                    </div>
                  </div>

                  {/* 顧客情報セクション */}
                  <div>
                    <h4 className="text-lg font-bold mb-4 text-foreground">顧客情報</h4>
                    <div className="space-y-0 divide-y border-t border-b">
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">顧客名</div>
                        <div className="flex-1 flex items-center gap-2 text-primary font-medium">
                          {selectedReservation.customer_name}
                          <Mail className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-primary" />
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">電話番号</div>
                        <div className="flex-1 text-sm text-foreground">{selectedReservation.customer_phone || '-'}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0">メールアドレス</div>
                        <div className="flex-1 text-sm text-foreground">{selectedReservation.customer_email || '-'}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-start">
                        <div className="w-40 text-sm font-bold text-muted-foreground mb-1 sm:mb-0 pt-1">顧客メモ</div>
                        <div className="flex-1">
                          <textarea 
                            className="w-full min-h-[100px] p-2 text-sm border rounded-md bg-gray-50" 
                            placeholder="メモを入力..."
                            defaultValue={selectedReservation.customer_notes || ''}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 px-6 py-4 flex justify-end gap-2 border-t">
                <Button variant="outline" onClick={() => setSelectedReservation(null)}>閉じる</Button>
                <Button variant="default">保存</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
