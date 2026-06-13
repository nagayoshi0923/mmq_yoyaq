/**
 * 公演の保存本体と重複チェックフロー（Phase 4-3 で useEventOperations から分割）。
 *
 * 最大の責務かつ最高リスク（履歴・貸切メール・予約同期・楽観更新が密に絡む）。
 * 挙動は useEventOperations 時代から不変。
 *
 * - handleSavePerformance: 保存の入口。タイムスロット単位＋実時間（準備時間考慮）の
 *     重複チェックを行い、重複があれば重複警告ダイアログ用の state をセットして中断、
 *     なければ doSavePerformance に委譲する
 * - doSavePerformance: 実際の保存（メモ変換 / 新規追加 / 編集更新 / 貸切リクエスト更新）。
 *     履歴記録・貸切変更メール・スタッフ予約同期・関連データ同期を含む
 * - handleConflictContinue: 重複警告からの続行（既存公演を削除してから保存）
 *
 * 重複警告ダイアログの state（isConflictWarningOpen / conflictInfo /
 * pendingPerformanceData）もこのフックが保持する。
 */
import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { scheduleApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { saveEmptySlotMemo } from '@/components/schedule/SlotMemoInput'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getEventTimeSlot, checkTimeOverlap } from '@/utils/eventOperationUtils'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import {
  confirmSendPrivateBookingChangeEmail,
  syncRelatedDataOnEventDateChange,
} from '@/hooks/eventOperations/eventSyncHelpers'
import { scheduleTimeSlotToEn, timeSlotEnToLabel } from '@/lib/timeSlot'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminUpdateReservationFieldsParams, RpcAdminDeleteReservationsByIdsParams } from '@/lib/rpcTypes'

interface Store {
  id: string
  name: string
  short_name: string
  is_temporary?: boolean
}

interface Scenario {
  id: string
  title: string
  duration?: number
  player_count_max?: number
  extra_preparation_time?: number // 準備時間（分）
  scenario_master_id?: string | null
}

interface PerformanceData {
  id?: string
  date: string
  store_id?: string
  venue: string
  scenario: string
  scenario_master_id?: string
  category: string
  start_time: string
  end_time: string
  capacity: number
  max_participants?: number
  gms: string[]
  gm_roles?: Record<string, string> // 追加
  notes?: string
  is_cancelled?: boolean
  is_reservation_enabled?: boolean
  is_private_request?: boolean
  reservation_id?: string
  reservation_name?: string // 予約者名（貸切用）
  time_slot?: string | null // 時間帯（朝/昼/夜）
  venue_rental_fee?: number // 場所貸し公演料金
}

interface UseEventSaveProps {
  events: ScheduleEvent[]
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>
  stores: Store[]
  scenarios: Scenario[]
  modalMode: 'add' | 'edit'
  organizationId: string | null
  fetchSchedule?: () => Promise<void> | void
  setEditingEvent: React.Dispatch<React.SetStateAction<ScheduleEvent | null>>
  setIsPerformanceModalOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useEventSave({
  events,
  setEvents,
  stores,
  scenarios,
  modalMode,
  organizationId,
  fetchSchedule,
  setEditingEvent,
  setIsPerformanceModalOpen,
}: UseEventSaveProps) {
  const queryClient = useQueryClient()

  // 重複警告ダイアログ状態
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)

  // 🚨 CRITICAL: 公演保存時の重複チェック機能（タイムスロット + 実時間 + 準備時間）
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    // タイムスロットを判定（保存された枠time_slotを優先、なければstart_timeから判定）
    let timeSlot: 'morning' | 'afternoon' | 'evening'
    const savedSlot = scheduleTimeSlotToEn(performanceData.time_slot)
    if (savedSlot) {
      timeSlot = savedSlot
    } else {
      const startHour = parseInt(performanceData.start_time.split(':')[0])
      if (startHour < 12) {
        timeSlot = 'morning'
      } else if (startHour < 17) {
        timeSlot = 'afternoon'
      } else {
        timeSlot = 'evening'
      }
    }
    
    // 重複チェック1：同じ日時・店舗・時間帯に既に公演があるか（タイムスロット単位）
    const slotConflictingEvents = events.filter(event => {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        return false
      }
      
      // 既存イベントの時間帯も保存された枠を優先
      const eventTimeSlot = getEventTimeSlot(event)
      return event.date === performanceData.date &&
             event.venue === performanceData.venue &&
             eventTimeSlot === timeSlot &&
             !event.is_cancelled
    })
    
    if (slotConflictingEvents.length > 0) {
      const conflictingEvent = slotConflictingEvents[0]
      const timeSlotLabel = timeSlotEnToLabel(timeSlot, 'candidate')
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
      
      // 重複警告モーダルを表示
      setConflictInfo({
        date: performanceData.date,
        storeName,
        timeSlot: timeSlotLabel,
        conflictingEvent: {
          id: conflictingEvent.id,
          scenario: conflictingEvent.scenario,
          gms: conflictingEvent.gms,
          start_time: conflictingEvent.start_time,
          end_time: conflictingEvent.end_time,
          is_private_request: conflictingEvent.is_private_request,
          reservation_id: conflictingEvent.reservation_id
        }
      })
      setPendingPerformanceData(performanceData)
      setIsConflictWarningOpen(true)
      return false
    }
    
    // 重複チェック2：実際の時間の重複（準備時間を考慮）
    // 同じ日・同じ店舗の全公演と時間を比較
    
    // 新規公演のシナリオから準備時間を取得
    const newScenario = scenarios.find(s => s.title === performanceData.scenario)
    const newPrepMinutes = newScenario?.extra_preparation_time || 0
    
    logger.log('🔍 準備時間チェック:', JSON.stringify({
      scenarioTitle: performanceData.scenario,
      foundScenario: !!newScenario,
      extra_preparation_time: newScenario?.extra_preparation_time,
      newPrepMinutes
    }))
    
    let timeConflict: { event: ScheduleEvent; reason: string } | null = null
    
    for (const event of events) {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        continue
      }
      
      // 同じ日・同じ店舗の公演のみ対象
      if (event.date !== performanceData.date || event.venue !== performanceData.venue || event.is_cancelled) {
        continue
      }
      
      // 既存公演のシナリオから準備時間を取得
      const existingScenario = scenarios.find(s => s.title === event.scenario)
      const existingPrepMinutes = existingScenario?.extra_preparation_time || 0
      
      // 時間の重複をチェック（両方向の準備時間を考慮）
      const result = checkTimeOverlap(
        event.start_time,
        event.end_time,
        performanceData.start_time,
        performanceData.end_time,
        existingPrepMinutes,
        newPrepMinutes
      )
      
      if (result.overlap) {
        timeConflict = { event, reason: result.reason || '時間が重複' }
        break
      }
    }
    
    if (timeConflict) {
      const conflictingEvent = timeConflict.event
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue
      
      // 重複警告モーダルを表示
      setConflictInfo({
        date: performanceData.date,
        storeName,
        timeSlot: `${conflictingEvent.start_time.slice(0, 5)}〜${conflictingEvent.end_time.slice(0, 5)}（${timeConflict.reason}）`,
        conflictingEvent: {
          id: conflictingEvent.id,
          scenario: conflictingEvent.scenario,
          gms: conflictingEvent.gms,
          start_time: conflictingEvent.start_time,
          end_time: conflictingEvent.end_time,
          is_private_request: conflictingEvent.is_private_request,
          reservation_id: conflictingEvent.reservation_id
        }
      })
      setPendingPerformanceData(performanceData)
      setIsConflictWarningOpen(true)
      return false  // 重複警告表示時はダイアログを閉じない
    }
    
    // 重複がない場合は直接保存
    return await doSavePerformance(performanceData)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSavePerformanceは後で定義されるため意図的に省略
  }, [events, stores, scenarios, modalMode])

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    try {
      // メモに変換する場合の特別処理
      if (performanceData.category === 'memo') {
        // シナリオ名とGM名をテキストに変換
        const memoLines: string[] = []
        if (performanceData.scenario) {
          memoLines.push(`【${performanceData.scenario}】`)
        }
        if (performanceData.gms && performanceData.gms.length > 0) {
          const gmNames = performanceData.gms.filter((gm: string) => gm.trim() !== '')
          if (gmNames.length > 0) {
            memoLines.push(`GM: ${gmNames.join(', ')}`)
          }
        }
        if (performanceData.notes) {
          memoLines.push(performanceData.notes)
        }
        const memoText = memoLines.join('\n')
        
        // 店舗IDを取得
        const storeId = performanceData.venue
        
        // スロットメモとして保存（localStorage）
        // time_slotを英語形式に変換（'朝'→'morning', '昼'→'afternoon', '夜'→'evening'）
        const timeSlotKey: 'morning' | 'afternoon' | 'evening' = scheduleTimeSlotToEn(performanceData.time_slot) ?? 'afternoon'

        await saveEmptySlotMemo(performanceData.date, storeId, timeSlotKey, memoText, organizationId ?? undefined)
        logger.log('✅ スロットメモ保存成功:', performanceData.date, storeId, timeSlotKey, memoText.substring(0, 50))
        // 表示用のスロットメモキャッシュを再取得（変換直後にメモセルを出す）
        void queryClient.invalidateQueries({ queryKey: ['schedule-slot-memos'] })

        // 編集モードの場合、元の公演を削除
        if (modalMode === 'edit' && performanceData.id) {
          await scheduleApi.delete(performanceData.id)
          showToast.success('公演をメモに変換しました')
        } else {
          showToast.success('メモを保存しました')
        }
        
        // モーダルを閉じる
        setIsPerformanceModalOpen(false)
        setEditingEvent(null)
        
        // スケジュールを再読み込み（fetchScheduleがsetEventsを行うので重複を避ける）
        if (fetchSchedule) {
          await fetchSchedule()
        }
        return true
      }
      
      if (modalMode === 'add') {
        // 新規追加
        // performanceData.venueは店舗ID（UUID）
        // 店舗の存在確認（通常の店舗 or 臨時会場）
        let storeQuery = supabase
          .from('stores')
          .select('id, name')
          .eq('id', performanceData.venue)
        if (organizationId) {
          storeQuery = storeQuery.eq('organization_id', organizationId)
        }
        const { data: storeData, error: storeError } = await storeQuery.single()
        
        if (storeError || !storeData) {
          throw new Error(`店舗ID「${performanceData.venue}」が見つかりません。先に店舗管理で店舗を追加してください。`)
        }
        
        const storeName = storeData.name
        
        // シナリオIDを取得
        let scenarioId = null
        if (performanceData.scenario) {
          const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
          scenarioId = matchingScenario?.id || null
        }
        
        // Supabaseに保存するデータ形式に変換
        // 全ての公演は最初は非公開、公開ボタンを押すまで公開しない
        
        // organization_idが取得できない場合はエラー
        if (!organizationId) {
          throw new Error('組織情報が取得できません。再ログインしてください。')
        }
        
        const eventData = {
          date: performanceData.date,
          store_id: storeData.id,
          venue: storeName,
          scenario: performanceData.scenario || '',
          scenario_master_id: scenarioId,
          category: performanceData.category,
          start_time: performanceData.start_time,
          end_time: performanceData.end_time,
          capacity: performanceData.max_participants,
          // gmsには名前のみ保存（空文字とUUIDを除外）
          gms: (() => {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return performanceData.gms.filter((gm: string) => gm.trim() !== '' && !uuidPattern.test(gm))
          })(),
          // gm_rolesからもUUIDキーを除外
          gm_roles: (() => {
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            const roles = performanceData.gm_roles || {}
            const cleanedRoles: Record<string, string> = {}
            Object.entries(roles).forEach(([key, value]) => {
              if (!uuidPattern.test(key)) {
                cleanedRoles[key] = value
              }
            })
            return cleanedRoles
          })(),
          notes: performanceData.notes || undefined,
          time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
          venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
          is_reservation_enabled: false, // 最初は非公開、公開ボタンで公開
          organization_id: organizationId, // マルチテナント対応
          reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
          is_reservation_name_overwritten: !!performanceData.reservation_name // 手動入力は上書きとみなす
        }

        // 楽観的 insert: 保存完了前にセルへ表示し、ユーザの不安感を解消する
        // 失敗時は finally ブロックで除外、成功時は real id に置き換える
        const matchedScenarioForOptimistic = scenarios.find(s => s.title === performanceData.scenario)
        const tempEventId = `temp-${crypto.randomUUID()}`
        const optimisticEvent: ScheduleEvent = {
          id: tempEventId,
          date: performanceData.date,
          venue: storeData.id,
          scenario: performanceData.scenario || '',
          scenarios: matchedScenarioForOptimistic ? {
            id: matchedScenarioForOptimistic.id,
            title: matchedScenarioForOptimistic.title,
            player_count_max: matchedScenarioForOptimistic.player_count_max ?? 8
          } : undefined,
          gms: performanceData.gms || [],
          gm_roles: performanceData.gm_roles || {},
          start_time: performanceData.start_time,
          end_time: performanceData.end_time,
          category: performanceData.category as ScheduleEvent['category'],
          is_cancelled: false,
          current_participants: 0,
          max_participants: performanceData.max_participants,
          notes: performanceData.notes || ''
        }
        setEvents(prev => [...prev, optimisticEvent])

        // Supabaseに保存
        let savedEvent
        try {
          savedEvent = await scheduleApi.create(eventData)
        } catch (saveError) {
          // 楽観的 insert を rollback
          setEvents(prev => prev.filter(e => e.id !== tempEventId))
          throw saveError
        }

        // 楽観的 insert の temp event を即座に real event へ置き換える。
        // ここを後続処理（履歴記録・スタッフ予約同期＝ネットワーク往復）の後に
        // 置くと、その間ずっと仮ID（temp-）のセルが見えてしまい、右クリックの
        // 中止・削除が「存在しないID」で失敗する（2026-06-13 テストで発覚）
        const matchedScenario = scenarios.find(s => s.title === performanceData.scenario)
        const effectiveMax = matchedScenario?.player_count_max || savedEvent.capacity || 8
        const formattedEvent: ScheduleEvent = {
          id: savedEvent.id,
          date: savedEvent.date,
          venue: savedEvent.store_id,
          scenario: savedEvent.scenario || '',
          scenarios: matchedScenario ? {
            id: matchedScenario.id,
            title: matchedScenario.title,
            player_count_max: matchedScenario.player_count_max ?? 8
          } : undefined,
          gms: savedEvent.gms || [],
          gm_roles: performanceData.gm_roles || {},
          start_time: savedEvent.start_time,
          end_time: savedEvent.end_time,
          category: savedEvent.category,
          is_cancelled: savedEvent.is_cancelled || false,
          current_participants: savedEvent.current_participants || 0,
          max_participants: effectiveMax,
          notes: savedEvent.notes || ''
        }
        setEvents(prev => prev.map(e => e.id === tempEventId ? formattedEvent : e))

        // 履歴を記録（新規作成）
        try {
          const createdSnapshot = await fetchEventSnapshot(savedEvent.id, organizationId)
          void createEventHistory(
            savedEvent.id,
            organizationId,
            'create',
            null,
            createdSnapshot ?? eventData,
            {
              date: eventData.date,
              storeId: eventData.store_id,
              timeSlot: eventData.time_slot || null
            }
          )
        } catch (historyError) {
          logger.error('履歴記録エラー（新規作成）:', historyError)
          // 履歴記録の失敗は保存処理に影響させない
        }

        // GM欄で「スタッフ参加」を選択した場合、予約も作成する
        if (performanceData.gm_roles && Object.values(performanceData.gm_roles).includes('staff')) {
          await reservationApi.syncStaffReservations(
            savedEvent.id,
            performanceData.gms || [],
            performanceData.gm_roles,
            {
              date: performanceData.date,
              start_time: performanceData.start_time,
              scenario_master_id: scenarioId || undefined,
              scenario_title: performanceData.scenario,
              store_id: storeData.id
            }
          )
        }
        
      } else {
        // 編集更新
        
        // 貸切リクエストの場合は reservations テーブルを更新
        logger.log('🔍 貸切判定:', { 
          is_private_request: performanceData.is_private_request, 
          reservation_id: performanceData.reservation_id,
          reservation_name: performanceData.reservation_name 
        })
        if (performanceData.is_private_request && performanceData.reservation_id) {
          let beforeQuery = supabase
            .from('reservations')
            .select(
              `
              store_id,
              display_customer_name,
              schedule_events!schedule_event_id (
                date,
                start_time,
                end_time,
                venue,
                scenario,
                store_id
              )
            `
            )
            .eq('id', performanceData.reservation_id)
          if (organizationId) {
            beforeQuery = beforeQuery.eq('organization_id', organizationId)
          }
          const { data: beforeRow } = await beforeQuery.maybeSingle()

          // performanceData.venueは店舗ID（UUID）
          // 店舗の存在確認（通常の店舗 or 臨時会場）
          let storeQuery = supabase
            .from('stores')
            .select('id, name')
            .eq('id', performanceData.venue)
          if (organizationId) {
            storeQuery = storeQuery.eq('organization_id', organizationId)
          }
          const { data: storeData } = await storeQuery.single()
          
          const storeId = storeData?.id || performanceData.venue
          
          // reservations テーブルを更新（店舗と編集された予約者名）
          // customer_name は元のMMQ予約者名として保持し、display_customer_name に編集後の名前を保存
          const updateStoreParams: RpcAdminUpdateReservationFieldsParams = {
            p_reservation_id: performanceData.reservation_id,
            p_updates: {
              store_id: storeId,
              display_customer_name: performanceData.reservation_name || null,
            },
          }
          const { error: reservationError } = await supabase.rpc('admin_update_reservation_fields', updateStoreParams)
          
          if (reservationError) {
            logger.error('❌ reservations更新エラー:', reservationError)
            throw new Error('貸切リクエストの更新に失敗しました')
          }
          
          logger.log('✅ reservations更新成功:', { reservation_id: performanceData.reservation_id })

          const reservationChanges: Array<{ field: string; label: string; oldValue: string; newValue: string }> = []
          if ((beforeRow?.store_id || '') !== storeId) {
            const oldStoreLabel = beforeRow?.store_id
              ? stores.find((s) => s.id === beforeRow.store_id)?.name || beforeRow.store_id
              : '—'
            reservationChanges.push({
              field: 'store',
              label: '店舗',
              oldValue: oldStoreLabel,
              newValue: storeData?.name || storeId,
            })
          }

          const oldDisplay = (beforeRow?.display_customer_name ?? '').trim()
          const newDisplay = (performanceData.reservation_name ?? '').trim()
          if (oldDisplay !== newDisplay) {
            reservationChanges.push({
              field: 'display_customer_name',
              label: '表示予約者名',
              oldValue: oldDisplay || '—',
              newValue: newDisplay || '—',
            })
          }

          const seRaw = beforeRow?.schedule_events
          const se = Array.isArray(seRaw) ? seRaw[0] : seRaw
          const currentSchedule =
            se != null
              ? {
                  date: se.date,
                  start_time: se.start_time,
                  end_time: se.end_time,
                  venueDisplay: storeData?.name || se.venue || '—',
                  scenario: se.scenario || undefined,
                  store_id: storeId,
                }
              : null

          if (reservationChanges.length > 0 && confirmSendPrivateBookingChangeEmail()) {
            try {
              await sendPrivateBookingCustomerChangeEmail({
                reservationId: performanceData.reservation_id,
                organizationId,
                changes: reservationChanges,
                currentSchedule,
                scenarioTitleHint: performanceData.scenario || se?.scenario,
              })
            } catch (notifyErr) {
              logger.error('貸切予約更新後の顧客メール送信エラー:', notifyErr)
            }
          }
          
          // ローカル状態を更新（店舗と予約者名）
          setEvents(prev => prev.map(event => 
            event.reservation_id === performanceData.reservation_id 
              ? { ...event, venue: storeId, reservation_name: performanceData.reservation_name || '' } 
              : event
          ))
        } else {
          // 編集モードでは必ずIDが存在するはず
          if (!performanceData.id) {
            throw new Error('公演IDが存在しません')
          }
          const eventId = performanceData.id
          
          // シナリオIDを取得
          let scenarioId = null
          if (performanceData.scenario) {
            const matchingScenario = scenarios.find(s => s.title === performanceData.scenario)
            scenarioId = matchingScenario?.id || null
          }
          
          // 通常公演の場合は schedule_events テーブルを更新
          // 店舗名を取得（storesには臨時会場が含まれていないのでDBから取得）
          const storeData = stores.find(s => s.id === performanceData.venue)
          let storeName = storeData?.name || ''
          let isTemporaryVenue = storeData?.is_temporary || false
          
          // storesに見つからない場合はDBから直接取得（臨時会場の場合）
          if (!storeData && performanceData.venue) {
            let storeQuery = supabase
              .from('stores')
              .select('id, name, short_name, is_temporary, temporary_dates, temporary_venue_names')
              .eq('id', performanceData.venue)
            if (organizationId) {
              storeQuery = storeQuery.eq('organization_id', organizationId)
            }
            const { data: dbStoreData } = await storeQuery.single()
            
            if (dbStoreData) {
              storeName = dbStoreData.name || dbStoreData.short_name || ''
              isTemporaryVenue = dbStoreData.is_temporary || false
            }
          }
          
          // 臨時会場で日付が変更された場合、移動先に臨時会場があるかチェック
          if (isTemporaryVenue && performanceData.id) {
            // 元のイベントから日付を取得
            let originalEventQuery = supabase
              .from('schedule_events')
              .select('date')
              .eq('id', performanceData.id)
            if (organizationId) {
              originalEventQuery = originalEventQuery.eq('organization_id', organizationId)
            }
            const { data: originalEvent } = await originalEventQuery.single()
            
            const originalDate = originalEvent?.date
            const newDate = performanceData.date
            
            // 日付が変更されている場合
            if (originalDate && newDate && originalDate !== newDate) {
              // 店舗の臨時会場情報を取得
              let tempVenueQuery = supabase
                .from('stores')
                .select('temporary_dates')
                .eq('id', performanceData.venue)
              if (organizationId) {
                tempVenueQuery = tempVenueQuery.eq('organization_id', organizationId)
              }
              const { data: tempVenueData } = await tempVenueQuery.single()
              
              if (tempVenueData) {
                const currentDates = tempVenueData.temporary_dates || []
                
                // 移動先の日付に臨時会場がない場合は警告して中止
                if (!currentDates.includes(newDate)) {
                  showToast.warning(`移動先の日付（${newDate}）に臨時会場「${storeName}」が追加されていません。先に臨時会場を追加してください。`)
                  return false
                }
              }
            }
          }
          
          // gmsからUUIDを除外（gmsには名前のみ保存）
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          const cleanedGms = (performanceData.gms || []).filter((gm: string) => gm.trim() !== '' && !uuidPattern.test(gm))
          const cleanedRoles: Record<string, string> = {}
          Object.entries(performanceData.gm_roles || {}).forEach(([key, value]) => {
            if (!uuidPattern.test(key)) {
              cleanedRoles[key] = value
            }
          })
          
          // 履歴用: 更新前の値を取得
          let oldEventQuery = supabase
            .from('schedule_events_staff_view')
            .select('id, organization_id, date, venue, store_id, scenario, scenario_master_id, gms, gm_roles, start_time, end_time, category, capacity, max_participants, notes, is_cancelled, is_tentative, is_reservation_enabled, reservation_name, time_slot, venue_rental_fee')
            .eq('id', performanceData.id)
          if (organizationId) {
            oldEventQuery = oldEventQuery.eq('organization_id', organizationId)
          }
          const { data: oldEventData } = await oldEventQuery.single()
          
          // 予約者名の変更を検出：DBの現在値と異なる場合のみ上書きフラグを立てる
          let isNameChanged = false
          if (performanceData.reservation_name) {
            if (oldEventData) {
              const dbReservationName = oldEventData.reservation_name || ''
              const newReservationName = performanceData.reservation_name || ''
              // 現在DBの値と入力値が異なる場合、上書きとみなす
              isNameChanged = dbReservationName !== newReservationName
            }
          }
          
          const updateData = {
            date: performanceData.date, // 日程移動用
            store_id: performanceData.venue, // 店舗移動用（store_id）
            venue: storeName, // 店舗名
            scenario: performanceData.scenario,
            scenario_master_id: scenarioId ?? undefined,
            category: performanceData.category,
            start_time: performanceData.start_time,
            end_time: performanceData.end_time,
            capacity: performanceData.max_participants,
            gms: cleanedGms,
            gm_roles: cleanedRoles,
            notes: performanceData.notes,
            time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
            venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
            reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
            // 名前が変更された場合のみ上書きフラグを更新
            ...(isNameChanged ? { is_reservation_name_overwritten: true } : {})
          }
          
          await scheduleApi.update(performanceData.id, updateData)

          // 関連データを同期（日程・時間が変更された場合）
          if (oldEventData && (oldEventData.date !== updateData.date || oldEventData.start_time !== updateData.start_time || oldEventData.end_time !== updateData.end_time)) {
            await syncRelatedDataOnEventDateChange(
              performanceData.id!,
              oldEventData.date,
              oldEventData.start_time,
              updateData.date,
              updateData.start_time,
              updateData.end_time,
              updateData.time_slot || null,
              organizationId
            )
          }

          const notifySchedulePrivateCustomer =
            !!performanceData.reservation_id &&
            (performanceData.category === 'private' || oldEventData?.category === 'private')
          if (notifySchedulePrivateCustomer && oldEventData) {
            const oldSnap = {
              date: oldEventData.date,
              start_time: oldEventData.start_time,
              end_time: oldEventData.end_time,
              venueDisplay: oldEventData.venue || '—',
              scenario: oldEventData.scenario || undefined,
              store_id: oldEventData.store_id,
            }
            const newSnap = {
              date: updateData.date,
              start_time: updateData.start_time,
              end_time: updateData.end_time,
              venueDisplay: updateData.venue || '—',
              scenario: updateData.scenario || undefined,
              store_id: updateData.store_id,
            }
            const scheduleChanges = diffScheduleSnapshotsForCustomerEmail(oldSnap, newSnap)
            if (scheduleChanges.length > 0 && confirmSendPrivateBookingChangeEmail()) {
              try {
                await sendPrivateBookingCustomerChangeEmail({
                  reservationId: performanceData.reservation_id!,
                  organizationId,
                  changes: scheduleChanges,
                  currentSchedule: newSnap,
                  scenarioTitleHint: newSnap.scenario || performanceData.scenario,
                })
              } catch (notifyErr) {
                logger.error('貸切公演（スケジュール更新）後の顧客メール送信エラー:', notifyErr)
              }
            }
          }
          
          // 履歴を記録（更新）
          if (organizationId) {
            try {
              const updatedSnapshot = await fetchEventSnapshot(performanceData.id!, organizationId)
              void createEventHistory(
                performanceData.id!,
                organizationId,
                'update',
                oldEventData || null,
                updatedSnapshot ?? updateData,
                {
                  date: updateData.date,
                  storeId: updateData.store_id,
                  timeSlot: updateData.time_slot || null
                }
              )
            } catch (historyError) {
              logger.error('履歴記録エラー（更新）:', historyError)
              // 履歴記録の失敗は保存処理に影響させない
            }
          }

          // GM欄で「スタッフ参加」を選択した場合、予約も同期する
          if (performanceData.gm_roles) {
            await reservationApi.syncStaffReservations(
              performanceData.id!,
              performanceData.gms || [],
              performanceData.gm_roles,
              {
                date: performanceData.date,
                start_time: performanceData.start_time,
                scenario_master_id: scenarioId || undefined,
                scenario_title: performanceData.scenario,
                store_id: performanceData.venue || undefined
              }
            )
          }

          // ローカル状態を更新（scenariosは元のデータを保持）
          setEvents(prev => prev.map(event => 
            event.id === performanceData.id 
              ? { ...event, ...performanceData, scenarios: event.scenarios, id: performanceData.id! } as ScheduleEvent 
              : event
          ))
        }
      }

      showToast.success('保存しました')
      // ダイアログは閉じない（ユーザーが明示的に閉じる）
      return true
    } catch (error) {
      logger.error('公演保存エラー:', error)
      showToast.error(modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました')
      return false
    }
  }, [modalMode, stores, scenarios, setEvents, setEditingEvent, setIsPerformanceModalOpen, organizationId, fetchSchedule, queryClient])

  // 重複警告からの続行処理
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData || !conflictInfo) return
    
    try {
      // タイムスロットを判定（保存された枠time_slotを優先）
      let timeSlot: 'morning' | 'afternoon' | 'evening'
      const savedSlot = scheduleTimeSlotToEn(pendingPerformanceData.time_slot)
      if (savedSlot) {
        timeSlot = savedSlot
      } else {
        const startHour = parseInt(pendingPerformanceData.start_time.split(':')[0])
        if (startHour < 12) {
          timeSlot = 'morning'
        } else if (startHour < 18) {
          timeSlot = 'afternoon'
        } else {
          timeSlot = 'evening'
        }
      }
      
      // 削除対象 = 「新公演と同じ時間帯の既存公演」＋「警告に出している重複公演そのもの」。
      // 後者は間隔不足(60分)のとき別の時間帯のことがあり、時間帯一致だけでは漏れる
      // （従来は同枠しか消さず、別枠の重複公演が残ったまま重なって保存されていた）。
      const conflictingEventId: string | undefined = conflictInfo.conflictingEvent?.id
      const conflictingEvents = events.filter(event => {
        if (modalMode === 'edit' && event.id === pendingPerformanceData.id) {
          return false
        }
        if (event.is_cancelled) return false
        if (event.date !== pendingPerformanceData.date || event.venue !== pendingPerformanceData.venue) {
          return false
        }
        // 既存イベントの時間帯も保存された枠を優先
        const eventTimeSlot = getEventTimeSlot(event)
        return eventTimeSlot === timeSlot || event.id === conflictingEventId
      })

      // 既存公演を削除
      for (const conflictEvent of conflictingEvents) {
        if (conflictEvent.is_private_request && conflictEvent.reservation_id) {
          await supabase.rpc('admin_delete_reservations_by_ids', {
            p_reservation_ids: [conflictEvent.reservation_id],
          } as RpcAdminDeleteReservationsByIdsParams)
        } else {
          await scheduleApi.delete(conflictEvent.id)
        }
      }

      // ローカル状態から削除
      const deletedIds = new Set(conflictingEvents.map(e => e.id))
      setEvents(prev => prev.filter(event => !deletedIds.has(event.id)))
      
      // 新しい公演を保存
      await doSavePerformance(pendingPerformanceData)
      setPendingPerformanceData(null)
      setIsConflictWarningOpen(false)
      setConflictInfo(null)
    } catch (error) {
      logger.error('既存公演の削除エラー:', error)
      showToast.error('既存公演の削除に失敗しました')
    }
  }, [pendingPerformanceData, conflictInfo, events, modalMode, setEvents, doSavePerformance])

  return {
    isConflictWarningOpen,
    conflictInfo,
    pendingPerformanceData,
    setIsConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    handleSavePerformance,
    handleConflictContinue,
  }
}
