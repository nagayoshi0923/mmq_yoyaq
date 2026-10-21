import { SAVED_NOTIFICATION_WARNING, SAVED_NOTIFICATION_DETAIL } from '@/lib/notificationResult'
import { loadPreparationNeighborEvents } from '@/lib/preparationNeighborEvents'
import { usePreparationSettings } from '@/hooks/usePreparationSettings'
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
import { useState, useCallback, useRef, useEffect } from 'react'
import { scheduleApi } from '@/lib/api'
import { ApiClientError } from '@/lib/apiClient'
import { reservationApi } from '@/lib/reservationApi'
import { eventReservationReadApi, eventStoreReadApi, eventScheduleReadApi } from '@/lib/api/eventOperationsApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { checkTimeOverlapWithPreparation } from '@/utils/eventOperationUtils'
import { createEventHistory, fetchEventSnapshot } from '@/lib/api/eventHistoryApi'
import { holdPendingScheduleEvent, releasePendingScheduleEvent } from '@/hooks/useScheduleEventsQuery'
import { listPendingEventCreates, addPendingEventCreate, removePendingEventCreate } from '@/lib/pendingEventCreate'
import { supabase } from '@/lib/supabase'
import {
  diffScheduleSnapshotsForCustomerEmail,
  sendPrivateBookingCustomerChangeEmail,
} from '@/lib/privateBookingCustomerChangeEmail'
import {
  confirmSendPrivateBookingChangeEmail,
} from '@/hooks/eventOperations/eventSyncHelpers'
import type { StaffParticipationPlan, ScheduleEvent } from '@/types/schedule'
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
  staffParticipation?: StaffParticipationPlan
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
  const { fetch: fetchPreparation } = usePreparationSettings()
  // 重複警告ダイアログ状態
  const [isConflictWarningOpen, setIsConflictWarningOpen] = useState(false)
  const conflictResult = useRef<((success: boolean) => void) | null>(null)
  const continuingConflict = useRef(false)
  useEffect(() => () => { conflictResult.current?.(false) }, [])
  const setConflictWarningOpen = useCallback((open: boolean) => {
    if (!open && continuingConflict.current) return
    setIsConflictWarningOpen(open)
    if (!open) {
      conflictResult.current?.(false)
      conflictResult.current = null
    }
  }, [])
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [pendingPerformanceData, setPendingPerformanceData] = useState<any>(null)

  // 🚨 CRITICAL: 公演保存時の重複チェック機能（タイムスロット + 実時間 + 準備時間）
  const handleSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    // 店舗未選択のまま進むと stores への id=eq.(空) という無効クエリ(400)が飛び、
    // 「店舗ID「」が見つかりません。先に店舗管理で店舗を追加してください」という
    // 誤誘導エラーになる（2026-07-02 オーナー実機報告）。ネットワークに出る前に止める。
    if (!performanceData.venue) {
      logger.error('公演保存: 店舗未選択で保存が呼ばれた', JSON.stringify({
        mode: modalMode, date: performanceData.date, scenario: performanceData.scenario,
      }))
      showToast.error('店舗が選択されていません。「店舗」プルダウンから選択してから保存してください')
      return false
    }
    // 重複/間隔チェック：同じ日・同じ店舗の全公演と「実際の時間」を比較（準備時間考慮）。
    // 以前あった「同じ朝/昼/夜の枠に既に公演がある」だけの粗いチェックは廃止した。
    // 十分な間隔（60分＋準備時間）が空いていれば、同じ枠に複数公演を置いてよい。
    // checkTimeOverlap が拾うのは「時間が完全に重複(overlap)」か「間隔不足(interval)」のみ。
    // ※ 警告を確認しても既存公演は絶対に削除しない（30分間隔の連続公演や2部屋同時公演を許容するため）。
    const newScenario = scenarios.find(s => s.title === performanceData.scenario)
    let preparation: Awaited<ReturnType<typeof fetchPreparation>>
    let neighborEvents: ScheduleEvent[]
    try { [preparation, neighborEvents] = await Promise.all([fetchPreparation(), loadPreparationNeighborEvents(performanceData.date)]) }
    catch { showToast.error('準備時間を取得できませんでした。再読み込みしてから保存してください'); return false }
    const newPrepMinutes = preparation({ storeId: performanceData.store_id || performanceData.venue, scenarioId: newScenario?.id, scenarioMasterId: performanceData.scenario_master_id || newScenario?.scenario_master_id, eventId: performanceData.id })

    logger.log('🔍 準備時間チェック:', JSON.stringify({
      scenarioTitle: performanceData.scenario,
      foundScenario: !!newScenario,
      extra_preparation_time: newScenario?.extra_preparation_time,
      newPrepMinutes
    }))

    // 完全重複(overlap)を最優先で確定。無ければ最初の間隔不足(interval)を採用する。
    let timeConflict: { event: ScheduleEvent; reason: string; kind: 'overlap' | 'interval' } | null = null

    for (const event of neighborEvents) {
      // 編集中の公演自身は除外
      if (modalMode === 'edit' && event.id === performanceData.id) {
        continue
      }

      // 同じ日・同じ店舗の公演のみ対象
      if (event.venue !== performanceData.venue || event.is_cancelled) {
        continue
      }

      // 既存公演のシナリオから準備時間を取得
      const existingScenario = scenarios.find(s => s.title === event.scenario)
      const existingPrepMinutes = preparation({ storeId: event.store_id || event.venue, scenarioId: existingScenario?.id, scenarioMasterId: event.scenario_master_id || existingScenario?.scenario_master_id, eventId: event.id })

      // 時間の重複をチェック（両方向の準備時間を考慮）
      const result = checkTimeOverlapWithPreparation(
        event.start_time,
        event.end_time,
        performanceData.start_time,
        performanceData.end_time,
        existingPrepMinutes,
        newPrepMinutes,
        event.date,
        performanceData.date
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
      return new Promise<boolean>(resolve => {
        conflictResult.current = resolve
      })
    }

    // 重複がない場合は直接保存
    return await doSavePerformance(performanceData)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSavePerformanceは後で定義されるため意図的に省略
  }, [events, stores, scenarios, modalMode, fetchPreparation])

  // 実際の保存処理（重複チェックなし）
  const doSavePerformance = useCallback(async (performanceData: PerformanceData): Promise<boolean> => {
    let staffSyncFailed = false
    let customerNotificationFailed = false
    // 公演本体が保存済みなら追加モードで再試行させない。部分成功を明示して閉じる。
    const syncStaff = async (...args: Parameters<typeof reservationApi.syncStaffReservations>) => {
      try {
        await reservationApi.syncStaffReservations(...args)
        setEvents(prev => prev.map(event => event.id === args[0] ? {...event,gms:args[1],gm_roles:args[2]} : event))
      } catch (error) {
        staffSyncFailed = true
        const detail = error instanceof ApiClientError ? error.message : 'スタッフ参加の登録を完了できませんでした。'
        showToast.warning('公演情報は保存しましたが、スタッフ参加の反映が未完了です。', `${detail} 公演を開き直して予約者一覧を確認してください。`)
      }
    }
    try {
      if (modalMode === 'add') {
        // 新規追加
        // performanceData.venueは店舗ID（UUID）
        // 店舗の存在確認（通常の店舗 or 臨時会場）
        const { data: storeData, error: storeError } = await eventStoreReadApi.findIdAndName(performanceData.venue, organizationId)
        
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
        
        // 担当（GM・スタッフ参加・追加席）と作成履歴は、公演の作成と同じ取引で確定する（create_schedule_event_with_staff）。
        // 以前は担当空で作成してから別の取引で保存していたため、担当の保存に失敗すると GM 空の公演が残り、
        // それでも「保存成功」扱いになっていた（2026-10-22 hotfix、PR #1210 の Codex レビュー P1）。GM 未指定は担当を空で送る。
        const pendingGms = performanceData.gms || []
        const pendingGmRoles = performanceData.gm_roles || {}
        const staffEntries = performanceData.staffParticipation?.entries ?? []
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
          gms: [] as string[],
          gm_roles: {} as Record<string,string>,
          staff_assignment: { gms: pendingGms, gm_roles: pendingGmRoles, entries: staffEntries },
          notes: performanceData.notes || undefined,
          time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
          venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
          is_reservation_enabled: false, // 最初は非公開、公開ボタンで公開
          organization_id: organizationId, // マルチテナント対応
          reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
          is_reservation_name_overwritten: !!performanceData.reservation_name // 手動入力は上書きとみなす
        }

        // 作成の要求 ID。結果が分からなかった前回の作成（この利用者・組織の分）は、確定するまで捨てない
        // （src/lib/pendingEventCreate.ts の不変条件。Codex 再レビュー 2fa19ac・7658a64・929c857）。
        // - 同じ入力の未確定の要求: その要求 ID で送る。DB が既に作った公演を返すので二重に作らない（未作成なら作る）
        // - 違う入力の未確定の要求: 先に DB で照合する。作成済みなら新しく作らずに知らせる。未作成なら DB がその要求を
        //   取消済みにする（遅れて届いても作らない）ので、確定として消してから通常の新規作成へ進む。照合できなければ作らない
        const requestFingerprint = JSON.stringify(eventData)
        const { data: sessionData } = await supabase.auth.getSession()
        const pendingUserId = sessionData?.session?.user?.id ?? 'unknown-user'
        let reusedPending = false
        let clientRequestId: string = crypto.randomUUID()
        for (const pendingCreate of listPendingEventCreates(organizationId, pendingUserId)) {
          if (pendingCreate.fingerprint === requestFingerprint) {
            clientRequestId = pendingCreate.requestId
            reusedPending = true
            continue
          }
          let previousEventId: string | null
          try {
            previousEventId = await scheduleApi.findCreatedByRequest(pendingCreate.requestId)
          } catch {
            throw new ApiClientError(502, `前回の保存（${pendingCreate.summary}）が作成されたか確認できませんでした。通信を確かめてから、もう一度保存してください`)
          }
          removePendingEventCreate(organizationId, pendingUserId, pendingCreate.requestId)
          if (previousEventId) {
            throw new ApiClientError(409, `前回の保存（${pendingCreate.summary}）は作成されていました。スケジュールを再読み込みして確かめてから、必要なら保存してください`)
          }
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
        // 保存中は、月の一覧を取り直しても入力した公演（GM 名を含む）を表示し続ける（Codex レビュー P2-1）
        holdPendingScheduleEvent(optimisticEvent)

        // Supabaseに保存（担当があれば同じ取引で保存。失敗したら公演も作られない）
        let savedEvent
        try {
          savedEvent = await scheduleApi.create({ ...eventData, client_request_id: clientRequestId })
        } catch (saveError) {
          // 楽観的 insert を rollback
          releasePendingScheduleEvent(tempEventId)
          setEvents(prev => prev.filter(e => e.id !== tempEventId))
          // 応答を受け取れなかった・作成されたか分からない場合は「失敗」と断定せず、確認してから保存し直すよう伝える
          // （確定したのに保存し直すと二重に作成される。Codex 再レビュー 2e24bbf の 4）
          const outcomeUnknown = !(saveError instanceof ApiClientError) || saveError.status >= 502 || saveError.body?.outcome === 'unknown'
          if (outcomeUnknown) {
            const persisted = addPendingEventCreate(organizationId, pendingUserId, {
              requestId: clientRequestId,
              fingerprint: requestFingerprint,
              summary: `${eventData.date} ${eventData.start_time.slice(0, 5)}${eventData.scenario ? ` ${eventData.scenario}` : ''}`,
              at: new Date().toISOString(),
            })
            throw new ApiClientError(502, persisted
              ? '公演が作成されたか確認できませんでした。スケジュールを再読み込みして確かめてください。この端末のこのブラウザで次に保存するとき、前回の保存が作成済みかを先に照合し、二重には作成しません'
              : '公演が作成されたか確認できませんでした。このブラウザに記録を残せなかったため、再読み込みや画面を閉じた後は照合できません。この画面のまま、同じ内容でもう一度保存してください（二重には作成しません）')
          }
          // DB がこの要求 ID を取消済み（別のタブ等の照合で未作成と確定）と答えた: 作成されないことが確定したので消す
          if (saveError instanceof ApiClientError && saveError.body?.outcome === 'cancelled') {
            removePendingEventCreate(organizationId, pendingUserId, clientRequestId)
            throw saveError
          }
          // 未確定の要求を同じ要求 ID で送り直したときの失敗（店舗確認などの前処理の失敗を含む）は、前回の要求が
          // 未作成である証拠にならないので、覚えたままにする（次の保存も同じ要求 ID で送る）
          if (reusedPending) throw new ApiClientError(saveError instanceof ApiClientError ? saveError.status : 502, `${saveError instanceof ApiClientError ? saveError.message : '保存できませんでした'}。前回の保存（同じ内容）が作成されたかはまだ確認できていません。もう一度保存すると、同じ保存として送り直します（二重には作成しません）`)
          throw saveError
        }
        releasePendingScheduleEvent(tempEventId)
        removePendingEventCreate(organizationId, pendingUserId, clientRequestId)

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
          // 担当は作成と同じ取引で保存済み。保存結果（DB の確定値）を表示する
          gms: savedEvent.gms || [],
          gm_roles: savedEvent.gm_roles || {},
          start_time: savedEvent.start_time,
          end_time: savedEvent.end_time,
          category: savedEvent.category,
          is_cancelled: savedEvent.is_cancelled || false,
          current_participants: savedEvent.current_participants || 0,
          max_participants: effectiveMax,
          notes: savedEvent.notes || ''
        }
        // 取り直しで実 ID の公演が先に届いていたら、そちら（応答より新しい可能性がある確定値。他端末の更新を含み得る）を残し、
        // 仮の公演だけを外す。応答の内容で上書きしない（Codex 再レビュー 2e24bbf の 2）
        setEvents(prev => {
          if (prev.some(e => e.id === formattedEvent.id)) return prev.filter(e => e.id !== tempEventId)
          return prev.some(e => e.id === tempEventId) ? prev.map(e => e.id === tempEventId ? formattedEvent : e) : [...prev, formattedEvent]
        })

        // 作成履歴は DB が作成と同じ取引で、確定した内容で記録済み（GM の有無によらない。Codex 再レビュー 2fa19ac の P2-②）。
        // 画面からは記録しない（保存直後の別の編集が作成値に混ざる・画面を離れると欠ける、を防ぐ）。

      } else {
        // 編集更新
        
        // 貸切リクエストの場合は reservations テーブルを更新
        logger.log('🔍 貸切判定:', { 
          is_private_request: performanceData.is_private_request, 
          reservation_id: performanceData.reservation_id,
          reservation_name: performanceData.reservation_name 
        })
        if (performanceData.is_private_request && performanceData.reservation_id) {
          const { data: beforeRow } = await eventReservationReadApi.findPrivateBeforeUpdate(performanceData.reservation_id, organizationId)

          // performanceData.venueは店舗ID（UUID）
          // 店舗の存在確認（通常の店舗 or 臨時会場）
          const { data: storeData } = await eventStoreReadApi.findIdAndName(performanceData.venue, organizationId)
          
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
          const { error: reservationError } = await eventReservationReadApi.adminUpdateFields(updateStoreParams)
          
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
              const notification = await sendPrivateBookingCustomerChangeEmail({
                reservationId: performanceData.reservation_id,
                organizationId,
                changes: reservationChanges,
                currentSchedule,
                scenarioTitleHint: performanceData.scenario || se?.scenario,
              })
              if (notification.status !== 'accepted') {
                showToast.warning(SAVED_NOTIFICATION_WARNING, SAVED_NOTIFICATION_DETAIL)
                customerNotificationFailed = true
              }
            } catch (notifyErr) {
              showToast.warning(SAVED_NOTIFICATION_WARNING, SAVED_NOTIFICATION_DETAIL)
              customerNotificationFailed = true
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
            const { data: dbStoreData } = await eventStoreReadApi.findForTemporaryCheck(performanceData.venue, organizationId)
            
            if (dbStoreData) {
              storeName = dbStoreData.name || dbStoreData.short_name || ''
              isTemporaryVenue = dbStoreData.is_temporary || false
            }
          }
          
          // 臨時会場で日付が変更された場合、移動先に臨時会場があるかチェック
          if (isTemporaryVenue && performanceData.id) {
            // 元のイベントから日付を取得
            const { data: originalEvent } = await eventScheduleReadApi.findDateById(performanceData.id, organizationId)
            
            const originalDate = originalEvent?.date
            const newDate = performanceData.date
            
            // 日付が変更されている場合
            if (originalDate && newDate && originalDate !== newDate) {
              // 店舗の臨時会場情報を取得
              const { data: tempVenueData } = await eventStoreReadApi.findTemporaryDates(performanceData.venue, organizationId)
              
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
          
          // 履歴用: 更新前の値を取得
          const { data: oldEventData } = await eventScheduleReadApi.findStaffViewById(performanceData.id, organizationId)
          
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
            notes: performanceData.notes,
            time_slot: performanceData.time_slot || null, // 時間帯（朝/昼/夜）
            venue_rental_fee: performanceData.venue_rental_fee, // 場所貸し公演料金
            reservation_name: performanceData.reservation_name || null, // 予約者名（貸切用）
            // 名前が変更された場合のみ上書きフラグを更新
            ...(isNameChanged ? { is_reservation_name_overwritten: true } : {})
          }
          
          await scheduleApi.update(performanceData.id, updateData)

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
                const notification = await sendPrivateBookingCustomerChangeEmail({
                  reservationId: performanceData.reservation_id!,
                  organizationId,
                  changes: scheduleChanges,
                  currentSchedule: newSnap,
                  scenarioTitleHint: newSnap.scenario || performanceData.scenario,
                })
                if (notification.status !== 'accepted') {
                  showToast.warning(SAVED_NOTIFICATION_WARNING, SAVED_NOTIFICATION_DETAIL)
                  customerNotificationFailed = true
                }
              } catch (notifyErr) {
                showToast.warning(SAVED_NOTIFICATION_WARNING, SAVED_NOTIFICATION_DETAIL)
                customerNotificationFailed = true
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
            await syncStaff(
              performanceData.id!,
              performanceData.gms || [],
              performanceData.gm_roles,
              {
                date: performanceData.date,
                start_time: performanceData.start_time,
                scenario_master_id: scenarioId || undefined,
                scenario_title: performanceData.scenario,
                store_id: performanceData.venue || undefined
              },
              performanceData.staffParticipation
            )
          }

          // ローカル状態を更新（scenariosは元のデータを保持）
          setEvents(prev => prev.map(event => 
            event.id === performanceData.id 
              ? { ...event, ...performanceData, gms: staffSyncFailed ? event.gms : performanceData.gms, gm_roles: staffSyncFailed ? event.gm_roles : performanceData.gm_roles, scenarios: event.scenarios, id: performanceData.id! } as ScheduleEvent
              : event
          ))
        }
      }

      if (!staffSyncFailed && !customerNotificationFailed) showToast.success('保存しました')
      // ダイアログは閉じない（ユーザーが明示的に閉じる）
      return true
    } catch (error) {
      logger.error('公演保存エラー:', error)
      // サーバが返した具体的な理由（例: 同一枠に既存公演がある 409）を固定文言で潰さない。
      // ApiClientError.message はサーバ側が意図して返す日本語文言（api/schedule.ts）のみが入る。
      const serverDetail = error instanceof ApiClientError && error.message ? error.message : null
      showToast.error(serverDetail ?? (modalMode === 'add' ? '公演の追加に失敗しました' : '公演の更新に失敗しました'))
      return false
    }
  }, [modalMode, stores, scenarios, setEvents, organizationId])

  // 重複/間隔警告からの続行処理：既存公演は削除せず、両方の公演を残して保存する。
  // （前後30分など間隔が短い連続公演・2部屋同時公演を許容するため、保存が他公演を消すことはしない。
  //   既存公演を消したい場合は右クリックの削除・中止など明示的な操作で行う。）
  const handleConflictContinue = useCallback(async () => {
    if (!pendingPerformanceData || continuingConflict.current) return
    continuingConflict.current = true
    try {
      const success = await doSavePerformance(pendingPerformanceData)
      conflictResult.current?.(success)
      conflictResult.current = null
      setPendingPerformanceData(null)
      setIsConflictWarningOpen(false)
      setConflictInfo(null)
    } finally {
      continuingConflict.current = false
    }
  }, [pendingPerformanceData, doSavePerformance])

  return {
    isConflictWarningOpen,
    conflictInfo,
    pendingPerformanceData,
    setIsConflictWarningOpen: setConflictWarningOpen,
    setConflictInfo,
    setPendingPerformanceData,
    handleSavePerformance,
    handleConflictContinue,
  }
}
