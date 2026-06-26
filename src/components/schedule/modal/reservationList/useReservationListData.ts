/**
 * 予約リストのデータ層フック（ReservationList から抽出・挙動不変）。
 *
 * サーバーデータ（reservations / loadingReservations / customerNames）と、その取得・realtime購読・
 * 顧客名取得の3 effect を保持。loadReservations / realtime / fetchCustomerNames は元 ReservationList の
 * 該当 effect を逐語移植。realtimeRefreshKey・debounceRef はフック内に閉じる。
 * 予約のステータス変更・キャンセル・参加者追加ハンドラが楽観更新するため setReservations を公開する。
 */
import { useState, useEffect, useRef } from 'react'
import { reservationApi, RESERVATION_WITH_CUSTOMER_SELECT_FIELDS } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { getCurrentOrganizationId } from '@/lib/organization'
import type { Reservation } from '@/types'
import type { ScheduleEvent } from '@/types/schedule'
import { sumActiveParticipants } from './participants'

interface UseReservationListDataParams {
  event: ScheduleEvent | null
  mode: 'add' | 'edit'
  onParticipantChange?: (eventId: string, newCount: number) => void
  onLocalParticipantUpdate?: (count: number) => void
}

export function useReservationListData({
  event,
  mode,
  onParticipantChange,
  onLocalParticipantUpdate,
}: UseReservationListDataParams) {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  // リアルタイム更新トリガー（他スタッフが予約を変更したとき増分）
  const [realtimeRefreshKey, setRealtimeRefreshKey] = useState(0)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [customerNames, setCustomerNames] = useState<string[]>([])

  // 予約データを読み込む
  useEffect(() => {
    const loadReservations = async () => {
      if (mode === 'edit' && event?.id) {
        setLoadingReservations(true)
        try {
          const eventOrgId =
            (event as any)?.organization_id ||
            (event as any)?.scenarios?.organization_id ||
            (event as any)?.stores?.organization_id ||
            null

          // 貸切予約の場合
          if (event.is_private_request && event.reservation_id) {
            logger.log('貸切予約を取得:', { reservationId: event.reservation_id, eventId: event.id })

            // event.idが仮想ID（UUID形式でない、または`private-`プレフィックス、または複合ID形式）の場合は、reservation_idから直接取得
            const isVirtualId = event.id.startsWith('private-') ||
                               !event.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
                               event.id.split('-').length > 5

            if (isVirtualId) {
              // 仮想IDの場合はreservation_idから直接取得
              const { data, error } = await supabase
                .from('reservations')
                .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])

              if (error) {
                logger.error('貸切予約データの取得に失敗:', error)
                setReservations([])
              } else {
                logger.log('貸切予約データ取得成功:', data)
                setReservations(data || [])
              }
            } else {
              // 実IDの場合（schedule_event_idが紐付いている）、schedule_event_idで取得を試みる
              const reservations = await reservationApi.getByScheduleEvent(event.id, eventOrgId)

              // schedule_event_idで取得できなかった場合、reservation_idで直接取得（フォールバック）
              if (reservations.length === 0) {
                logger.log('schedule_event_idで取得できず、reservation_idで取得を試みます')
                const { data, error } = await supabase
                  .from('reservations')
                  .select(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
                .eq('id', event.reservation_id)
                .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])

                if (error) {
                  logger.error('貸切予約データの取得に失敗:', error)
                  setReservations([])
                } else {
                  logger.log('貸切予約データ取得成功（フォールバック）:', data)
                  setReservations(data || [])
                }
              } else {
                logger.log('貸切予約データ取得成功（schedule_event_id経由）:', reservations)
                setReservations(reservations)
              }
            }
          } else {
            // 通常の予約の場合、schedule_event_idで取得
            const data = await reservationApi.getByScheduleEvent(event.id, eventOrgId)
            logger.log('通常予約データ取得:', { eventId: event.id, count: data.length })
            setReservations(data)
            const totalParticipants = sumActiveParticipants(data)
            // DBのcurrent_participantsと実際の予約合計がズレていれば修正
            if (event.id && totalParticipants !== (event.current_participants ?? -1)) {
              recalculateCurrentParticipants(event.id).catch(e =>
                logger.warn('参加者数のDB修正に失敗（制約違反の可能性）:', e)
              )
            }
            // バッジ・スケジュールカード両方を正しい値に同期
            onLocalParticipantUpdate?.(totalParticipants)
            if (onParticipantChange && event.id) {
              onParticipantChange(event.id, totalParticipants)
            }
          }
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
          setReservations([])
        } finally {
          setLoadingReservations(false)
        }
      } else {
        setReservations([])
      }
    }

    loadReservations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, event?.id, event?.is_private_request, event?.reservation_id, realtimeRefreshKey])

  // リアルタイム購読: 他スタッフが同じ公演の予約を変更したとき自動更新
  useEffect(() => {
    if (mode !== 'edit' || !event?.id) return

    const eventId = event.id
    const channelName = `reservation_list_${eventId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          // 貸切予約は reservation_id で紐付くため、schedule_event_id フィルターは貸切非対応
          // → クライアント側で event.id をチェックして絞り込む
        },
        (payload) => {
          const record = (payload.new || payload.old) as { schedule_event_id?: string } | null
          // 現在開いている公演の予約変更のみ処理
          if (record?.schedule_event_id !== eventId) return

          logger.log('📡 ReservationList Realtime: 予約変更検知', payload.eventType)

          // デバウンス: 500ms 以内の連続更新をまとめる
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(() => {
            setRealtimeRefreshKey(k => k + 1)
          }, 500)
        }
      )
      .subscribe()

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      supabase.removeChannel(channel)
      logger.log('🔌 ReservationList Realtime: 購読解除', channelName)
    }
  }, [mode, event?.id])

  // 顧客名を取得（customersテーブル + 過去予約のparticipant_names）
  useEffect(() => {
    const fetchCustomerNames = async () => {
      try {
        const orgId = await getCurrentOrganizationId()
        const names = new Set<string>()

        // 1. customers テーブルから取得
        const { data: customers, error: custError } = await supabase
          .from('customers')
          .select('name')
          .not('name', 'is', null)
          .not('name', 'eq', '')
        if (custError) {
          logger.error('顧客テーブル取得エラー:', custError)
        } else {
          customers?.forEach(c => {
            if (c.name?.trim()) names.add(c.name.trim())
          })
        }

        // 2. 過去予約の participant_names からも補完
        let resQuery = supabase
          .from('reservations')
          .select('customer_notes, participant_names')
          .not('customer_notes', 'is', null)
          .not('customer_notes', 'eq', '')
        if (orgId) {
          resQuery = resQuery.eq('organization_id', orgId)
        }
        const { data: reservations, error: resError } = await resQuery
        if (!resError && reservations) {
          reservations.forEach(r => {
            if (r.customer_notes) {
              const name = r.customer_notes.replace(/様$/, '').trim()
              if (name) names.add(name)
            }
            if (Array.isArray(r.participant_names)) {
              r.participant_names.forEach((name: string) => {
                if (name?.trim()) names.add(name.trim())
              })
            }
          })
        }

        setCustomerNames(Array.from(names).sort())
      } catch (error) {
        logger.error('顧客名の取得に失敗:', error)
      }
    }

    fetchCustomerNames()
  }, [])

  return {
    reservations,
    setReservations,
    loadingReservations,
    customerNames,
  }
}
