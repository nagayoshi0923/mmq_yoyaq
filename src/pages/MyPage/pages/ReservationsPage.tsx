import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, CheckCircle, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { logger } from '@/utils/logger'
import { OptimizedImage } from '@/components/ui/optimized-image'
import type { Reservation } from '@/types'
import type { Store } from '@/types'

export function ReservationsPage() {
  const { user } = useAuth()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [scenarioImages, setScenarioImages] = useState<Record<string, string>>({})
  const [stores, setStores] = useState<Record<string, Store>>({})

  useEffect(() => {
    if (user?.email) {
      fetchReservations()
    }
  }, [user])

  const fetchReservations = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // 顧客情報を取得
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id')
        .eq('email', user.email)
        .maybeSingle()

      if (customerError) throw customerError
      if (!customer) {
        setReservations([])
        return
      }

      // 予約を取得（決済方法も含む）
      const { data, error } = await supabase
        .from('reservations')
        .select('*, payment_method, payment_status')
        .eq('customer_id', customer.id)
        .order('requested_datetime', { ascending: false })

      if (error) throw error
      setReservations(data || [])

      // シナリオの画像を取得
      if (data && data.length > 0) {
        const scenarioIds = data
          .map(r => r.scenario_id)
          .filter((id): id is string => id !== null && id !== undefined)
        
        if (scenarioIds.length > 0) {
          const { data: scenarios, error: scenariosError } = await supabase
            .from('scenarios')
            .select('id, key_visual_url')
            .in('id', scenarioIds)
          
          if (scenariosError) {
            logger.error('シナリオ画像取得エラー:', scenariosError)
          } else if (scenarios) {
            const imageMap: Record<string, string> = {}
            scenarios.forEach(s => {
              if (s.key_visual_url) {
                imageMap[s.id] = s.key_visual_url
              }
            })
            setScenarioImages(imageMap)
          }
        }

        // 店舗情報を取得
        const storeIds = new Set<string>()
        data.forEach(r => {
          // 確定済み店舗ID
          if (r.store_id) {
            storeIds.add(r.store_id)
          }
          // 貸切予約の候補店舗
          if (r.candidate_datetimes) {
            const candidateDatetimes = r.candidate_datetimes as any
            if (candidateDatetimes.confirmedStore?.storeId) {
              storeIds.add(candidateDatetimes.confirmedStore.storeId)
            }
            if (candidateDatetimes.requestedStores) {
              candidateDatetimes.requestedStores.forEach((store: any) => {
                if (store.storeId) {
                  storeIds.add(store.storeId)
                }
              })
            }
          }
        })

        if (storeIds.size > 0) {
          const { data: storesData, error: storesError } = await supabase
            .from('stores')
            .select('id, name, address')
            .in('id', Array.from(storeIds))
          
          if (storesError) {
            logger.error('店舗情報取得エラー:', storesError)
          } else if (storesData) {
            const storeMap: Record<string, Store> = {}
            storesData.forEach(store => {
              storeMap[store.id] = store as Store
            })
            setStores(storeMap)
          }
        }
      }
    } catch (error) {
      logger.error('予約履歴取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (date: string) => {
    const d = new Date(date)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  const getPaymentMethodLabel = (method: string | null | undefined) => {
    if (!method) return '未設定'
    switch (method) {
      case 'cash':
        return '現地決済（現金）'
      case 'credit_card':
        return 'クレジットカード'
      case 'online':
        return 'オンライン決済'
      case 'bank_transfer':
        return '銀行振込'
      case 'paypay':
        return 'PayPay'
      case 'line_pay':
        return 'LINE Pay'
      default:
        return method
    }
  }

  const getPaymentMethodBadgeColor = (method: string | null | undefined) => {
    if (!method) return 'bg-gray-100 text-gray-800'
    switch (method) {
      case 'cash':
        return 'bg-green-100 text-green-800'
      case 'credit_card':
      case 'online':
        return 'bg-blue-100 text-blue-800'
      case 'bank_transfer':
        return 'bg-purple-100 text-purple-800'
      case 'paypay':
      case 'line_pay':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStoreInfo = (reservation: Reservation) => {
    // 確定済み店舗
    if (reservation.store_id && stores[reservation.store_id]) {
      return {
        name: stores[reservation.store_id].name,
        address: stores[reservation.store_id].address
      }
    }

    // 貸切予約の確定店舗
    if (reservation.candidate_datetimes) {
      const candidateDatetimes = reservation.candidate_datetimes as any
      if (candidateDatetimes.confirmedStore?.storeId) {
        const storeId = candidateDatetimes.confirmedStore.storeId
        if (stores[storeId]) {
          return {
            name: stores[storeId].name,
            address: stores[storeId].address
          }
        }
        // 店舗情報がまだ取得できていない場合、候補データから名前を取得
        return {
          name: candidateDatetimes.confirmedStore.storeName || '店舗未定',
          address: ''
        }
      }

      // 希望店舗（確定前）
      if (candidateDatetimes.requestedStores && candidateDatetimes.requestedStores.length > 0) {
        const firstStore = candidateDatetimes.requestedStores[0]
        if (firstStore.storeId && stores[firstStore.storeId]) {
          return {
            name: stores[firstStore.storeId].name,
            address: stores[firstStore.storeId].address
          }
        }
        return {
          name: firstStore.storeName || '店舗未定',
          address: ''
        }
      }
    }

    return null
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">読み込み中...</div>
        </CardContent>
      </Card>
    )
  }

  const upcomingReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) >= new Date() && r.status === 'confirmed'
  )
  const pastReservations = reservations.filter(
    (r) => new Date(r.requested_datetime) < new Date() && r.status === 'confirmed'
  )
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled')

  return (
    <div className="space-y-6">
      {/* 参加予定の予約 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            参加予定の予約 ({upcomingReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              参加予定の予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors bg-blue-50"
                >
                  {/* シナリオ画像 */}
                  <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                    {reservation.scenario_id && scenarioImages[reservation.scenario_id] ? (
                      <OptimizedImage
                        src={scenarioImages[reservation.scenario_id]}
                        alt={reservation.title}
                        className="w-full h-full object-cover"
                        responsive={true}
                        srcSetSizes={[48, 96, 192]}
                        breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                        useWebP={true}
                        quality={85}
                        fallback={
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-sm sm:text-base truncate">{reservation.title}</span>
                      <Badge variant="default" className="bg-blue-100 text-blue-800 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        参加予定
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">参加人数</div>
                      <div className="font-medium text-sm">{reservation.participant_count}名</div>
                    </div>
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">金額</div>
                      <div className="font-medium text-sm">{formatCurrency(reservation.final_price)}</div>
                    </div>
                    <div>
                      <Badge className={`${getPaymentMethodBadgeColor(reservation.payment_method)} text-xs`}>
                        {getPaymentMethodLabel(reservation.payment_method)}
                      </Badge>
                    </div>
                  </div>
                  {getStoreInfo(reservation) && (
                    <div className="w-full text-xs sm:text-sm text-muted-foreground space-y-0.5 mt-2 pt-2 border-t">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium">{getStoreInfo(reservation)?.name}</span>
                      </div>
                      {getStoreInfo(reservation)?.address && (
                        <div className="pl-4 text-xs">{getStoreInfo(reservation)?.address}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参加済みの予約 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            参加済みの予約 ({pastReservations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pastReservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              参加済みの予約はありません
            </div>
          ) : (
            <div className="space-y-3">
              {pastReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* シナリオ画像 */}
                  <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                    {reservation.scenario_id && scenarioImages[reservation.scenario_id] ? (
                      <OptimizedImage
                        src={scenarioImages[reservation.scenario_id]}
                        alt={reservation.title}
                        className="w-full h-full object-cover"
                        responsive={true}
                        srcSetSizes={[48, 96, 192]}
                        breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                        useWebP={true}
                        quality={85}
                        fallback={
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-sm sm:text-base truncate">{reservation.title}</span>
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        参加済み
                      </Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">参加人数</div>
                      <div className="font-medium text-sm">{reservation.participant_count}名</div>
                    </div>
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">金額</div>
                      <div className="font-medium text-sm">{formatCurrency(reservation.final_price)}</div>
                    </div>
                    <div>
                      <Badge className={`${getPaymentMethodBadgeColor(reservation.payment_method)} text-xs`}>
                        {getPaymentMethodLabel(reservation.payment_method)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* キャンセル済みの予約 */}
      {cancelledReservations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              キャンセル済み ({cancelledReservations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cancelledReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors opacity-60"
                >
                  {/* シナリオ画像 */}
                  <div className="flex-shrink-0 w-12 h-16 bg-gray-200 rounded overflow-hidden">
                    {reservation.scenario_id && scenarioImages[reservation.scenario_id] ? (
                      <OptimizedImage
                        src={scenarioImages[reservation.scenario_id]}
                        alt={reservation.title}
                        className="w-full h-full object-cover"
                        responsive={true}
                        srcSetSizes={[48, 96, 192]}
                        breakpoints={{ mobile: 48, tablet: 64, desktop: 96 }}
                        useWebP={true}
                        quality={85}
                        fallback={
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            No Image
                          </div>
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-sm sm:text-base line-through truncate">{reservation.title}</span>
                      <Badge variant="destructive" className="text-xs">キャンセル</Badge>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      {formatDateTime(reservation.requested_datetime)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">参加人数</div>
                      <div className="font-medium text-sm">{reservation.participant_count}名</div>
                    </div>
                    <div className="text-right sm:text-left">
                      <div className="text-xs sm:text-sm text-muted-foreground">金額</div>
                      <div className="font-medium text-sm">{formatCurrency(reservation.final_price)}</div>
                    </div>
                    <div>
                      <Badge className={`${getPaymentMethodBadgeColor(reservation.payment_method)} text-xs`}>
                        {getPaymentMethodLabel(reservation.payment_method)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

