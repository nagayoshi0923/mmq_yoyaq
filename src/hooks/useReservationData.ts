import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import type { Reservation } from '@/types'

// 予約管理画面用の拡張型
// Reservationのstatus/payment_statusを上書きするためOmitで除外してから拡張
export interface ReservationWithDetails extends Omit<Reservation, 'status' | 'payment_status' | 'candidate_datetimes'> {
  customer_name?: string
  event_date?: string
  event_time?: string
  end_time?: string // 追加
  scenario_title?: string
  store_name?: string
  // UI表示用に追加または型拡張
  candidate_datetimes?: {
    candidates: Array<{
      date: string
      startTime: string
      endTime: string
    }>
  }
  // 実際のDB値と型定義の不一致を許容するための拡張
  status: Reservation['status'] | 'pending_gm' | 'pending_store'
  payment_status: Reservation['payment_status'] | 'unpaid'
  total_amount?: number // 後方互換性またはエイリアス用
}

interface Filters {
  searchTerm: string
  statusFilter: string
  paymentFilter: string
  typeFilter: string
}

/**
 * 予約データの取得とフィルタリングを管理するフック
 */
export function useReservationData(filters: Filters) {
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadReservations = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // organization_idを取得（マルチテナント対応）
      const orgId = await getCurrentOrganizationId()
      
      // Supabaseから予約データを取得
      let query = supabase
        .from('reservations')
        .select(`
          *,
          scenarios:scenario_id (title),
          stores:store_id (name)
        `)
      
      // 組織フィルタ
      if (orgId) {
        query = query.eq('organization_id', orgId)
      }
      
      const { data, error } = await query
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (error) {
        logger.error('予約データ取得エラー:', error)
        setReservations([])
        return
      }
      
      // データを整形
      const formattedData: ReservationWithDetails[] = (data || []).map((reservation: any) => {
        let eventDate = ''
        let eventTime = ''
        let endTime = ''
        
        if (reservation.requested_datetime) {
          const dateStr = reservation.requested_datetime
          const parts = dateStr.split('T')
          if (parts.length === 2) {
            eventDate = parts[0]
            eventTime = parts[1].slice(0, 5)
          } else {
            const spaceParts = dateStr.split(' ')
            if (spaceParts.length >= 2) {
              eventDate = spaceParts[0]
              eventTime = spaceParts[1].slice(0, 5)
            }
          }

          // 終了時間の計算
          if (eventTime && reservation.duration) {
            const [hours, minutes] = eventTime.split(':').map(Number)
            const date = new Date()
            date.setHours(hours, minutes + reservation.duration)
            endTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
          }
        }
        
        return {
          ...reservation,
          scenario_title: reservation.scenarios?.title || reservation.title,
          store_name: reservation.stores?.name || '',
          event_date: eventDate,
          event_time: eventTime,
          end_time: endTime,
          total_amount: reservation.final_price || reservation.total_price || 0 // 金額フィールドの統一
        }
      })
      
      setReservations(formattedData)
    } catch (error) {
      logger.error('予約データの読み込みエラー:', error)
      setReservations([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReservations()
  }, [loadReservations])

  // フィルタリング処理
  const filteredReservations = useMemo(() => {
    const searchLower = (filters.searchTerm || '').toLowerCase()

    return reservations.filter((reservation) => {
      const matchesSearch =
        (reservation.reservation_number || '').toLowerCase().includes(searchLower) ||
        (reservation.customer_name || '').toLowerCase().includes(searchLower) ||
        (reservation.scenario_title || '').toLowerCase().includes(searchLower)

      const matchesStatus =
        filters.statusFilter === 'all' || reservation.status === filters.statusFilter

      const matchesPayment =
        filters.paymentFilter === 'all' || reservation.payment_status === filters.paymentFilter

      const matchesType =
        filters.typeFilter === 'all' || reservation.reservation_source === filters.typeFilter

      return matchesSearch && matchesStatus && matchesPayment && matchesType
    })
  }, [reservations, filters.searchTerm, filters.statusFilter, filters.paymentFilter, filters.typeFilter])

  return {
    reservations: filteredReservations,
    isLoading,
    loadReservations
  }
}
