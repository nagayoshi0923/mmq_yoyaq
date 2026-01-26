import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { HelpButton } from '@/components/ui/help-button'
import { AppLayout } from '@/components/layout/AppLayout'
import { PageHeader } from '@/components/layout/PageHeader'
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { 
  Ticket, Search, Filter, Download, FileText, X, Mail, ExternalLink
} from 'lucide-react'
import { 
  Dialog, DialogContent
} from '@/components/ui/dialog'
import { useSessionState } from '@/hooks/useSessionState'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useReservationData, ReservationWithDetails } from '@/hooks/useReservationData'
import { useReservationStats } from '@/hooks/useReservationStats'
import { devDb } from '@/components/ui/DevField'
import { format, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'

// 異常検知ロジック
const getReservationAlerts = (reservation: ReservationWithDetails) => {
  const alerts = []
  const eventDate = reservation.event_date ? new Date(reservation.event_date) : null
  const isEventPast = eventDate && isPast(eventDate)

  if (isEventPast && ['pending', 'pending_gm', 'pending_store'].includes(reservation.status)) {
    alerts.push({ type: 'warning', message: '過去の未処理予約' })
  }
  if (reservation.status === 'confirmed' && !reservation.event_date && reservation.reservation_source === 'web_private') {
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
  
  // フィルタ状態
  const [searchTerm, setSearchTerm] = useSessionState('reservationSearchTerm', '')
  const [statusFilter, setStatusFilter] = useSessionState('reservationStatusFilter', 'all')
  const [paymentFilter, setPaymentFilter] = useSessionState('reservationPaymentFilter', 'all')
  const [typeFilter, setTypeFilter] = useSessionState('reservationTypeFilter', 'all')
  const [alertFilter, setAlertFilter] = useSessionState('reservationAlertFilter', 'all')
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

  // フィルタリングとソート
  const filteredReservations = reservations.filter(r => {
    if (alertFilter === 'alert_only') {
      return getReservationAlerts(r).length > 0
    }
    return true
  })

  const sortedReservations = [...filteredReservations].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
    return dateB - dateA // 新しい順（降順）
  })

  // モバイル用グルーピング (予約受付日ベース)
  const groupedReservations = sortedReservations.reduce((acc, r) => {
    // created_at がない場合は 'undecided'
    const dateKey = r.created_at ? r.created_at.split('T')[0] : 'undecided'
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(r)
    return acc
  }, {} as Record<string, ReservationWithDetails[]>)
  
  const sortedDates = Object.keys(groupedReservations).sort((a, b) => {
    if (a === 'undecided') return -1
    if (b === 'undecided') return 1
    return new Date(b).getTime() - new Date(a).getTime()
  })

  // UIヘルパー関数群
  const getStatusBadge = (status: string) => {
    // Badgeのvariant型を拡張したものとして扱う（実際にはBadgeコンポーネント側で定義済み）
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple' | 'gray' }> = {
      confirmed: { label: '予約確定', variant: 'success' },
      pending: { label: '保留', variant: 'warning' },
      cancelled: { label: 'キャンセル', variant: 'gray' },
      pending_gm: { label: 'GM確認中', variant: 'info' },
      gm_confirmed: { label: 'GM確定', variant: 'success' }, // 青寄りのsuccessがあれば区別してもいいが、確定なのでsuccessで統一
      pending_store: { label: '店舗確認中', variant: 'purple' },
      no_show: { label: '無断キャンセル', variant: 'destructive' },
      completed: { label: '完了', variant: 'outline' }
    }
    // @ts-ignore: variantの型定義拡張が反映されるまでts-ignore
    const config = statusConfig[status] || { label: status, variant: 'outline' }
    
    return (
      // @ts-ignore
      <Badge variant={config.variant} className="whitespace-nowrap">
        {config.label}
      </Badge>
    )
  }

  const isLoading = isListLoading || isStatsLoading

  if (isLoading) {
    return (
      <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6">
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
    <AppLayout currentPage="reservations" maxWidth="max-w-[1440px]" containerPadding="px-[10px] py-3 sm:py-4 md:py-6" className="mx-auto">
      <div className="space-y-6">
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">予約一覧</span>
            </div>
          }
          description="予約状況の確認と管理"
        >
          <HelpButton topic="reservation" label="予約管理マニュアル" />
          <Button variant="default" size="sm" className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white">
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

        {/* フィルター＆検索 (修正版) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="予約番号、顧客名、シナリオ名で検索..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="pl-9 h-10 bg-white w-full" 
            />
          </div>
          <Button variant="outline" size="icon" className="h-10 w-10 bg-white flex-shrink-0" onClick={() => setIsFilterOpen(!isFilterOpen)}>
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10 bg-white flex-shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        </div>

        {/* フィルター詳細 (維持) */}
        {isFilterOpen && (
          <Card className="bg-gray-50 border-dashed shadow-none">
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1"><Label className="text-xs">ステータス</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="confirmed">確定</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs">支払い</Label><Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="unpaid">未払い</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs">ソース</Label><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">すべて</SelectItem><SelectItem value="web">Web</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label className="text-xs text-red-600">アラート</Label><Select value={alertFilter} onValueChange={setAlertFilter}><SelectTrigger className="h-8 bg-white border-red-200"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">なし</SelectItem><SelectItem value="alert_only">あり</SelectItem></SelectContent></Select></div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================
            PC表示: テーブル形式
           ======================================================================== */}
        <div className="hidden md:block bg-white border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-[50px] text-center"></TableHead>
                <TableHead className="w-[100px]">予約番号</TableHead>
                <TableHead className="w-[160px]">受付日時</TableHead>
                <TableHead className="w-[180px]">公演日時</TableHead>
                <TableHead className="w-[120px]">ステータス</TableHead>
                <TableHead>顧客名</TableHead>
                <TableHead>予約ページ</TableHead>
                <TableHead>スタッフ</TableHead>
                <TableHead>お支払い</TableHead>
                <TableHead>予約メモ</TableHead>
                <TableHead className="text-right">詳細</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedReservations.map((reservation) => (
                <TableRow key={reservation.id} className="hover:bg-gray-50/50 cursor-pointer h-16" onClick={() => setSelectedReservation(reservation)}>
                  <TableCell className="text-center"><input type="checkbox" className="rounded border-gray-300" onClick={(e) => e.stopPropagation()} /></TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600" {...devDb('reservations.reservation_number')}>{reservation.reservation_number || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900 text-sm">
                        {/* @ts-ignore */}
                        {reservation.created_at ? format(new Date(reservation.created_at), 'yyyy/MM/dd') : '-'}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {/* @ts-ignore */}
                        {reservation.created_at ? format(new Date(reservation.created_at), 'HH:mm') : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900">{reservation.event_date ? format(new Date(reservation.event_date), 'yyyy/MM/dd') : '未定'}</span>
                      <span className="text-xs text-gray-500 font-mono">{reservation.event_time || '--:--'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(reservation.status)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-blue-600 hover:underline" {...devDb('reservations.customer_name')}>{reservation.customer_name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-blue-600 font-medium truncate max-w-[150px]" title={reservation.scenario_title}>
                      【{reservation.scenario_title}】
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-500">-</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span className="text-gray-900" {...devDb('reservations.payment_method')}>{reservation.payment_method || '現地決済'}</span>
                      <span className={reservation.payment_status === 'unpaid' ? 'text-red-600 font-bold' : 'text-gray-500'} {...devDb('reservations.total_amount')}>
                        ¥{(reservation.total_amount || 0).toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {reservation.customer_notes ? <FileText className="h-4 w-4 text-gray-400" /> : <span className="text-gray-300">-</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800 h-8 text-xs">
                      予約詳細
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* ========================================================================
            モバイル表示: PC版のテーブル行をベースにしたコンパクトリスト
           ======================================================================== */}
        <div className="md:hidden space-y-4">
          {sortedDates.map(dateKey => (
            <div key={dateKey} className="bg-white border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
                <span className="text-sm font-bold text-gray-700">
                  {dateKey === 'undecided' ? '受付日不明' : 
                   /* @ts-ignore */
                   format(new Date(dateKey), 'yyyy/MM/dd (EEE)', { locale: ja }) + ' 受付'}
                </span>
                <span className="text-xs bg-white px-2 py-0.5 rounded border text-gray-500">{groupedReservations[dateKey].length}件</span>
              </div>
              
              <div className="divide-y">
                {groupedReservations[dateKey].map(reservation => (
                  <div key={reservation.id} className="p-3 hover:bg-gray-50 active:bg-gray-100 transition-colors" onClick={() => setSelectedReservation(reservation)}>
                    {/* 上段: 時間・ステータス・金額 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-gray-900">
                          {/* @ts-ignore */}
                          {reservation.event_date ? format(new Date(reservation.event_date), 'MM/dd') : ''} {reservation.event_time || '--:--'}
                        </span>
                        {getStatusBadge(reservation.status)}
                        <span className="text-[10px] text-gray-400 font-mono">#{reservation.reservation_number?.slice(-4) || ''}</span>
                      </div>
                      <div className={`text-sm font-bold ${reservation.payment_status === 'unpaid' ? 'text-red-600' : 'text-gray-900'}`}>
                        ¥{(reservation.total_amount || 0).toLocaleString()}
                      </div>
                    </div>
                    
                    {/* 下段: 顧客名・シナリオ名 */}
                    <div className="flex justify-between items-end gap-2">
                      <div className="flex-1 min-w-0 grid gap-0.5">
                        <div className="font-medium text-sm text-blue-600 truncate">{reservation.customer_name}</div>
                        <div className="text-xs text-gray-500 truncate">【{reservation.scenario_title}】</div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 shrink-0">
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
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">予約詳細</h2>
                    <div className="mt-2 text-gray-500 text-sm font-medium">
                      {/* @ts-ignore */}
                      {selectedReservation.event_date ? format(new Date(selectedReservation.event_date), 'yyyy年MM月dd日 (EEE)', { locale: ja }) : '日付未定'}
                      <span className="mx-2">
                        {selectedReservation.event_time || ''} ~ {selectedReservation.end_time ? selectedReservation.end_time.slice(0, 5) : ''}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mt-1 text-gray-900">{selectedReservation.customer_name}</h3>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedReservation(null)} className="text-gray-400 hover:text-gray-500">
                    <X className="h-6 w-6" />
                  </Button>
                </div>

                <div className="space-y-8">
                  {/* 予約情報セクション */}
                  <div>
                    <h4 className="text-lg font-bold mb-4 text-gray-900">予約情報</h4>
                    <div className="space-y-0 divide-y border-t border-b">
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">予約番号</div>
                        <div className="flex-1 font-mono text-sm text-gray-900">
                          {selectedReservation.reservation_number || '-'}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">予約ページ</div>
                        <div className="flex-1 text-blue-600 font-medium flex items-center gap-2">
                          {selectedReservation.event_date && (
                            <span className="mr-2">
                              {/* @ts-ignore */}
                              {format(new Date(selectedReservation.event_date), 'yyyy/MM/dd', { locale: ja })} {selectedReservation.event_time}
                            </span>
                          )}
                          【{selectedReservation.scenario_title}】
                          {selectedReservation.scenario_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-2 h-7 px-2 text-xs"
                              onClick={() => navigate(`/scenario-detail/${selectedReservation.scenario_id}`)}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              シナリオ詳細
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">公演日時</div>
                        <div className="flex-1 text-sm text-gray-900">
                          {/* @ts-ignore */}
                          {selectedReservation.event_date ? format(new Date(selectedReservation.event_date), 'yyyy年MM月dd日 (EEE)', { locale: ja }) : '未定'}
                          {' '}{selectedReservation.event_time} ~
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">予約受付日時</div>
                        <div className="flex-1 text-sm text-gray-900">
                          {/* @ts-ignore */}
                          {selectedReservation.created_at ? format(new Date(selectedReservation.created_at), 'yyyy年MM月dd日 HH:mm', { locale: ja }) : '-'}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">ステータス</div>
                        <div className="flex-1 flex items-center gap-2">
                          {getStatusBadge(selectedReservation.status)}
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">チェックイン</div>
                        <div className="flex-1">
                          <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                            チェックイン
                          </Button>
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">お支払い</div>
                        <div className="flex-1 text-sm text-gray-900">{selectedReservation.payment_method || '現地決済'}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">予約者名</div>
                        <div className="flex-1 text-sm text-gray-900">{selectedReservation.customer_name}</div>
                      </div>
                    </div>
                  </div>

                  {/* 顧客情報セクション */}
                  <div>
                    <h4 className="text-lg font-bold mb-4 text-gray-900">顧客情報</h4>
                    <div className="space-y-0 divide-y border-t border-b">
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">顧客名</div>
                        <div className="flex-1 flex items-center gap-2 text-blue-600 font-medium">
                          {selectedReservation.customer_name}
                          <Mail className="h-4 w-4 text-gray-400 cursor-pointer hover:text-blue-600" />
                        </div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">電話番号</div>
                        <div className="flex-1 text-sm text-gray-900">{selectedReservation.customer_phone || '-'}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-center">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0">メールアドレス</div>
                        <div className="flex-1 text-sm text-gray-900">{selectedReservation.customer_email || '-'}</div>
                      </div>
                      <div className="py-4 flex flex-col sm:flex-row sm:items-start">
                        <div className="w-40 text-sm font-bold text-gray-700 mb-1 sm:mb-0 pt-1">顧客メモ</div>
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
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">保存</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
