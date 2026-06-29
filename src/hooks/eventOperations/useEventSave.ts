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
import { scheduleApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { checkTimeOverlap } from '@/utils/eventOperationUtils'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import {
  confirmSendPrivateBookingChangeEmail,
  syncRelatedDataOnEventDateChange,
} from '@/hooks/eventOperations/eventSyncHelpers'
import type { ScheduleEvent } from '@/types/schedule'
import type { RpcAdminUpdateReservationFieldsParams } from '@/lib/rpcTypes'

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
}

/**
 * 楽観表示・保存直後カードに添付する scenarios（マスタ情報）を引くための照合。
 *
 * モーダルはシナリオ選択時に scenario_master_id（= 組織シナリオの id）を渡すため、
 * タイトルが厳密一致しなくても id で確実に引ける。タイトル厳密一致のみだと、
 * リロード時の寛容な照合（useScheduleEventsQuery の findScenario）との差で、
 * 登録済みシナリオでも「シナリオマスタ未登録」⚠️ がリロードまで誤表示されていた（F-2）。
 */
function findDisplayScenario(
  scenarios: Scenario[],
  title: string,
  masterId?: string | null,
): Scenario | undefined {
  return (
    scenarios.find(s => s.title === title) ||
    (masterId ? scenarios.find(s => s.id === masterId || s.scenario_master_id === masterId) : undefined)
  )
}

export function useEventSave({
  events,
  setEvents,
  stores,
  scenarios,
  modalMode,
  organizationId,
}: UseEventSaveProps) {
  // 重複警告ダイアログ状態
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)

  // 🚨 CRITICAL: 公演保存時の重複チェック機能（タイムスロット + 実時間 + 準備時間）
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    // 重複/間隔チェック：同じ日・同じ店舗の全公演と「実際の時間」を比較（準備時間考慮）。
    // 以前あった「同じ朝/昼/夜の枠に既に公演がある」だけの粗いチェックは廃止した。
    // 十分な間隔（60分＋準備時間）が空いていれば、同じ枠に複数公演を置いてよい。
    // checkTimeOverlap が拾うのは「時間が完全に重複(overlap)」か「間隔不足(interval)」のみ。
    // ※ 警告を確認しても既存公演は絶対に削除しない（30分間隔の連続公演や2部屋同時公演を許容するため）。
    const newScenario = scenarios.find(s => s.title === performanceData.scenario)
    const newPrepMinutes = newScenario?.extra_preparation_time || 0

    logger.log('🔍 準備時間チェック:', JSON.stringify({
      scenarioTitle: performanceData.scenario,
      foundScenario: !!newScenario,
      extra_preparation_time: newScenario?.extra_preparation_time,
      newPrepMinutes
    }))

    // 完全重複(overlap)を最優先で確定。無ければ最初の間隔不足(interval)を採用する。
    let timeConflict: { event: ScheduleEvent; reason: string; kind: 'overlap' | 'interval' } | null = null

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
        const kind: 'overlap' | 'interval' = result.reason === '時間が重複' ? 'overlap' : 'interval'
        if (kind === 'overlap') {
          // 時間が完全に重なるケースは最優先で確定（以降は探索不要）
          timeConflict = { event, reason: result.reason || '時間が重複', kind }
          break
        }
        // 間隔不足は最初の1件だけ保持（後で overlap が見つかれば上書きされる）
        if (!timeConflict) {
          timeConflict = { event, reason: result.reason || '間隔不足', kind }
        }
      }
    }

    if (timeConflict) {
      const conflictingEvent = timeConflict.event
      const storeName = stores.find(s => s.id === performanceData.venue)?.name || performanceData.venue

      // 重複/間隔の警告モーダルを表示（破壊的操作はしない＝既存公演はそのまま残す）
      setConflictInfo({
        date: performanceData.date,
        storeName,
        kind: timeConflict.kind,
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
      return false  // 警告表示時はダイアログを閉じない
    }

    // 重複がない場合は直接保存
    return await doSavePerformance(performanceData)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSavePerformanceは後で定義されるため意図的に省略
  }, [events, stores, scenarios, modalMode])

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    try {
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
        
        // シナリオIDを取得（タイトル厳密一致が崩れても scenario_master_id で確実に引く＝堅牢化）
        // ※ ここが厳密一致のみだと、貸切等で scenario_master_id が NULL 保存され、
        //   給与計算・キット需要から公演がサイレントに漏れる（過去 273 件の原因）
        let scenarioId = null
        if (performanceData.scenario) {
          const matchingScenario = findDisplayScenario(scenarios, performanceData.scenario, performanceData.scenario_master_id)
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
        const matchedScenarioForOptimistic = findDisplayScenario(scenarios, performanceData.scenario, performanceData.scenario_master_id)
        const tempEventId = `temp-${crypto.randomUUID()}`
        const optimisticEvent: ScheduleEvent = {
          id: tempEventId,
          date: performanceData.date,
          venue: storeData.id,
          scenario: performanceData.scenario || '',
          scenarios: matchedScenarioForOptimistic ? {
            id: matchedScenarioForOptimistic.id,
            // PerformanceCard の警告判定は event.scenario === event.scenarios.title を要求するため、
            // 入力タイトルを優先採用して偽の「未登録」警告を防ぐ（正規タイトルはリロードで揃う）
            title: performanceData.scenario || matchedScenarioForOptimistic.title,
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
        const matchedScenario = findDisplayScenario(scenarios, savedEvent.scenario || performanceData.scenario, performanceData.scenario_master_id)
        const effectiveMax = matchedScenario?.player_count_max || savedEvent.capacity || 8
        const formattedEvent: ScheduleEvent = {
          id: savedEvent.id,
          date: savedEvent.date,
          venue: savedEvent.store_id,
          scenario: savedEvent.scenario || '',
          scenarios: matchedScenario ? {
            id: matchedScenario.id,
            // 警告判定（event.scenario === event.scenarios.title）を満たすため保存値のタイトルを優先
            title: savedEvent.scenario || performanceData.scenario || matchedScenario.title,
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
          
          // シナリオIDを取得（編集時も scenario_master_id フォールバックで堅牢に）
          let scenarioId = null
          if (performanceData.scenario) {
            const matchingScenario = findDisplayScenario(scenarios, performanceData.scenario, performanceData.scenario_master_id)
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
  }, [modalMode, stores, scenarios, setEvents, organizationId])

  // 重複/間隔警告からの続行処理：既存公演は削除せず、両方の公演を残して保存する。
  // （前後30分など間隔が短い連続公演・2部屋同時公演を許容するため、保存が他公演を消すことはしない。
  //   既存公演を消したい場合は右クリックの削除・中止など明示的な操作で行う。）
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData) return
    // doSavePerformance が成否トーストを出す
    await doSavePerformance(pendingPerformanceData)
    setPendingPerformanceData(null)
    setIsConflictWarningOpen(false)
    setConflictInfo(null)
  }, [pendingPerformanceData, doSavePerformance])

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
