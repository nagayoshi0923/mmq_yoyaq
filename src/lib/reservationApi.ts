import { notificationOutcome, waitlistNotificationOutcome, discordCancellationOutcome } from '@/lib/notificationResult'
import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import { logger, generateCorrelationId, createCorrelatedLogger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import type { StaffParticipationPlan, StaffParticipationEntry, StaffParticipationReservation } from '@/types/schedule'
import { isSenshinPrivateBooking } from '@/lib/senshinPrivateBooking'
import type { Reservation, Customer, ReservationSummary } from '@/types'

/** 戦塵貸切の Discord チャンネル名に ⚠️ を付ける。失敗しても呼び出し元のキャンセルは成功とする */
export async function markSenshinDiscordCancelled(input: {
  reservationId: string
  organizationId?: string | null
  scenario_master_id?: string | null
  scenario_title?: string | null
}): Promise<void> {
  try {
    let masterId = input.scenario_master_id
    let title = input.scenario_title
    let orgId = input.organizationId ?? null
    if (masterId == null && (title == null || title === '')) {
      const { data } = await supabase
        .from('reservations')
        .select('organization_id, scenario_master_id, title')
        .eq('id', input.reservationId)
        .maybeSingle()
      if (!data) return
      masterId = data.scenario_master_id
      title = data.title
      orgId = orgId || data.organization_id
    }
    if (!isSenshinPrivateBooking({ scenario_master_id: masterId, scenario_title: title })) return
    const response = await supabase.functions.invoke('provision-private-booking-discord', {
      body: {
        action: 'cancel',
        reservationId: input.reservationId,
        organizationId: orgId,
      },
    })
    const outcome = discordCancellationOutcome(response)
    if (outcome.status === 'accepted') logger.log('戦塵Discordチャンネル取消受付確認', { reservationId: input.reservationId })
    else if (outcome.status === 'skipped') logger.log('戦塵Discord取消処理スキップ', { reservationId: input.reservationId, ...outcome })
    else logger.warn('予約取消は保存済み・Discord取消未確認', { reservationId: input.reservationId, ...outcome })
  } catch (e) {
    logger.error('戦塵Discordキャンセル処理エラー:', e)
  }
}

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const CUSTOMER_SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, avatar_url, birth_date, prefecture, preferences, notification_settings, created_at, updated_at' as const

// =============================================================================
// 予約 SELECT フィールド定数
//
// 用途に応じて以下を使い分けること（select('*') 禁止）:
//
//   RESERVATION_SELECT_FIELDS
//     → 予約テーブルのみ。getAll / getByCustomer / 作成後の再取得など。
//
//   RESERVATION_WITH_CUSTOMER_SELECT_FIELDS
//     → 予約 + customers JOIN。モーダル・中止処理・承認フローなど
//       顧客情報を画面表示 or メール本文に使う場合。
//
//   RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS
//     → 予約 + customers + schedule_events JOIN。
//       キャンセルフロー（GM・貸切グループへの通知 + is_private_booking 判定が必要）。
//
//   RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS
//     → 予約 + customers + schedule_events JOIN（変更メール向け最小列）。
//       予約変更確認メール送信時のみ。
//
// ⚠ DB に scenario_title 列はない。表示名は title / schedule_events.scenario を使う。
// =============================================================================

/** 予約テーブルのみ（JOIN なし） */
export const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, cancellation_policy_snapshot_version, cancellation_policy_store_id, cancellation_policy_performance_type, cancellation_policy_deadline_hours, cancellation_policy_fees, cancellation_policy_fee_basis, cancellation_policy_updated_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes, arrived_late' as const

/** 予約 + customers JOIN（モーダル・承認フローなど顧客情報が必要な場合） */
export const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS =
  `${RESERVATION_SELECT_FIELDS}, customers(${CUSTOMER_SELECT_FIELDS})` as const

const SCHEDULE_EVENT_EMBED_FOR_CANCEL =
  'schedule_events!schedule_event_id(id, date, start_time, end_time, venue, scenario, organization_id, is_private_booking, gms, store_id)'

/** 予約 + customers + schedule_events JOIN（キャンセルフロー用: GM通知・is_private_booking 判定が必要） */
export const RESERVATION_WITH_CUSTOMER_AND_EVENT_SELECT_FIELDS =
  `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_CANCEL}` as const

const SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL =
  'schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario, store_id)'

/** 予約 + customers + schedule_events JOIN（予約変更確認メール用: is_private_booking 不要） */
export const RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS =
  `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL}` as const

/** customers 埋め込みが PostgREST の型推論で配列になる場合があるため正規化 */
export function joinedCustomerFromReservation(
  c: Customer | Customer[] | null | undefined
): Customer | null {
  if (c == null) return null
  return Array.isArray(c) ? c[0] ?? null : c
}

type CreateReservationWithLockParams = Omit<
  Reservation,
  'id' | 'created_at' | 'updated_at' | 'reservation_number'
> & {
  // 冪等性: リトライ時に同じ予約番号を使う
  reservation_number?: string
}

// 顧客関連のAPI
// 顧客関連のAPI
//
// 全メソッドがバックエンド API (/api/customers) 経由。organization_id は
// サーバー側で JWT から強制取得し、自組織が所有する顧客のみ操作できる。
// クライアントが渡した organization_id / user_id は無視される（マルチテナント境界）。
export const customerApi = {
  // 全顧客を取得
  // バックエンド API (/api/customers) 経由で org_id をサーバー側で強制フィルタ
  // organizationId 引数は後方互換のため残すが未使用
  async getAll(_organizationId?: string): Promise<Customer[]> {
    return apiClient.get<Customer[]>('/api/customers')
  },

  // 顧客を作成
  // バックエンド API 経由。organization_id はサーバー側で JWT から強制設定。
  // クライアントが他組織の組織 ID を渡しても無視される。
  async create(customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'visit_count' | 'total_spent'>): Promise<Customer> {
    return apiClient.post<Customer>('/api/customers', { customer })
  },

  // 顧客を更新
  // バックエンド API 経由。自組織が所有する顧客のみ更新可能（サーバー側でガード）。
  // 更新可能フィールドはサーバー側のホワイトリストでフィルタされる（Mass Assignment 防止）。
  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const params = new URLSearchParams({ id })
    return apiClient.patch<Customer>(`/api/customers?${params}`, { updates })
  },

  // メールアドレスで自組織内の顧客を検索（バックエンド経由）
  // サーバー側で organization_id を JWT から強制フィルタするため、
  // 他組織の同一メールアドレス顧客は返らない（マルチテナント境界）。
  async findByEmail(email: string): Promise<Customer | null> {
    const params = new URLSearchParams({ action: 'findByEmail', email })
    return apiClient.get<Customer | null>(`/api/customers?${params}`)
  },

  // 電話番号で自組織内の顧客を検索（バックエンド経由）
  async findByPhone(phone: string): Promise<Customer | null> {
    const params = new URLSearchParams({ action: 'findByPhone', phone })
    return apiClient.get<Customer | null>(`/api/customers?${params}`)
  },

  // 顧客を削除
  // バックエンド API 経由。自組織が所有する顧客のみ削除可能（サーバー側でガード）。
  async delete(id: string): Promise<void> {
    const params = new URLSearchParams({ id })
    await apiClient.delete<{ success: boolean }>(`/api/customers?${params}`)
  }
}

// =============================================================================
// 予約関連のAPI
//
// すべて /api/reservations 経由でバックエンド API を呼び出す。
// organization_id はサーバー側 JWT 由来で強制フィルタするため、
// クライアントから渡す organization_id 引数は基本的に無視される
// （後方互換のため引数シグネチャは維持）。
// =============================================================================
export const reservationApi = {
  // 全予約を取得
  async getAll(_organizationId?: string): Promise<Reservation[]> {
    return apiClient.get<Reservation[]>('/api/reservations')
  },

  // 特定期間の予約を取得
  async getByDateRange(startDate: string, endDate: string, _organizationId?: string): Promise<Reservation[]> {
    return apiClient.get<Reservation[]>(
      `/api/reservations?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`
    )
  },

  // スケジュールイベントIDで予約を取得
  // バックエンド API (/api/reservations?type=by-schedule-event) 経由で org_id を強制フィルタ。
  // _organizationId 引数は後方互換のため残すが未使用。
  async getByScheduleEvent(scheduleEventId: string, _organizationId?: string | null): Promise<Reservation[]> {
    return apiClient.get<Reservation[]>(
      `/api/reservations?type=by-schedule-event&schedule_event_id=${encodeURIComponent(scheduleEventId)}`
    )
  },

  // 顧客IDで予約を取得
  // バックエンド API (/api/reservations?type=by-customer) 経由で org_id を強制フィルタ。
  // _organizationId 引数は後方互換のため残すが未使用。
  async getByCustomer(customerId: string, _organizationId?: string): Promise<Reservation[]> {
    return apiClient.get<Reservation[]>(
      `/api/reservations?type=by-customer&customer_id=${encodeURIComponent(customerId)}`
    )
  },

  // 予約を作成（RPC + FOR UPDATE をサーバー側で実施）
  async create(reservation: CreateReservationWithLockParams): Promise<Reservation> {
    // organization_id はサーバ側 JWT から取得されるため、フロントの値は送らない（送っても無視）。
    // 後方互換のため、明示渡しがあれば残す。
    return apiClient.post<Reservation>('/api/reservations?action=create', {
      reservation: {
        schedule_event_id: reservation.schedule_event_id,
        participant_count: reservation.participant_count,
        customer_id: reservation.customer_id,
        customer_name: reservation.customer_name ?? null,
        customer_email: reservation.customer_email ?? null,
        customer_phone: reservation.customer_phone ?? null,
        customer_notes: reservation.customer_notes ?? null,
        how_found: (reservation as Record<string, unknown>).how_found ?? null,
        reservation_number: reservation.reservation_number,
        customer_coupon_id: (reservation as Record<string, unknown>).customer_coupon_id ?? null,
      },
    })
  },

  // ─── 管理者・デモ用の直接書き込み（整備 Phase 2: 画面からの直接 INSERT / UPDATE / DELETE をここに集約） ───
  // RPC（create_reservation_with_lock_v2）の満員・重複判定を意図的に通さない（管理者の手動追加・デモ参加者）。
  // 表示人数（schedule_events.current_participants）は DB トリガーが再計算する（#730 の規則）。
  // 戻り値は supabase の { data, error } をそのまま返す（呼び出し側の扱いを変えないため）。
  async insertDirect(rows: Record<string, unknown> | Record<string, unknown>[], select = 'id'): Promise<{ data: Reservation[] | null; error: { message: string } | null }> {
    // select を文字列変数で渡すと型が決まらないため、呼び出し側が使う形に合わせて明示する
    const { data, error } = await supabase.from('reservations').insert(rows).select(select)
    return { data: (data as unknown as Reservation[] | null), error }
  },
  // デモ・テストプレイ予約の後始末（ScheduleManager の修復処理）。顧客の予約には使わない。
  async deleteDirectByIds(ids: string[]) {
    // eslint-disable-next-line no-restricted-syntax -- デモ予約の削除。顧客予約は cancelWithLock を使う
    return supabase.from('reservations').delete().in('id', ids)
  },
  // GMテストのデモ予約の参加費修正（ScheduleManager の修復処理）。顧客の予約には使わない。
  async updatePricesDirect(id: string, prices: { base_price: number; total_price: number; final_price: number }) {
    // eslint-disable-next-line no-restricted-syntax -- デモ予約の金額修正。顧客予約は update / recalculatePrices を使う
    return supabase.from('reservations').update(prices).eq('id', id)
  },

  // 予約をキャンセル（RPC + FOR UPDATE をサーバー側で実施）
  async cancelWithLock(reservationId: string, customerId: string | null, reason?: string): Promise<boolean> {
    await apiClient.patch<{ success: boolean }>(
      `/api/reservations?action=cancel-with-lock&id=${encodeURIComponent(reservationId)}`,
      {
        customer_id: customerId,
        cancellation_reason: reason ?? null,
      }
    )
    await markSenshinDiscordCancelled({ reservationId })
    return true
  },

  // 予約 + 貸切グループを同一トランザクションでキャンセル（通常キャンセル専用）
  // 却下フロー（skipGroupCancel: true）では使わず、cancelWithLock を使い続けること
  async cancelWithGroupLock(reservationId: string, customerId: string | null, reason?: string): Promise<boolean> {
    await apiClient.patch<{ success: boolean }>(
      `/api/reservations?action=cancel-with-group-lock&id=${encodeURIComponent(reservationId)}`,
      {
        customer_id: customerId,
        cancellation_reason: reason ?? null,
      }
    )
    return true
  },

  // 参加人数を変更（RPC + FOR UPDATE をサーバー側で実施）
  async updateParticipantsWithLock(
    reservationId: string,
    newCount: number,
    customerId: string | null
  ): Promise<boolean> {
    const result = await apiClient.patch<{ success: boolean }>(
      `/api/reservations?action=update-participants-with-lock&id=${encodeURIComponent(reservationId)}`,
      {
        new_count: newCount,
        customer_id: customerId,
      }
    )
    return Boolean(result?.success)
  },

  // 料金/参加者名の再計算（サーバー側で実施）
  async recalculatePrices(reservationId: string, participantNames?: string[] | null): Promise<boolean> {
    const result = await apiClient.patch<{ success: boolean }>(
      `/api/reservations?action=recalculate-prices&id=${encodeURIComponent(reservationId)}`,
      { participant_names: participantNames ?? null }
    )
    return Boolean(result?.success)
  },

  // 参加人数を変更（顧客向けシンプルAPI）
  async updateParticipantCount(reservationId: string, newCount: number, sendEmail: boolean = true): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ログインが必要です')
    }

    logger.log('人数変更開始:', { reservationId, newCount })

    // 予約情報を取得して料金を再計算
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select(`
        id, reservation_number, unit_price, schedule_event_id, participant_count, customer_id,
        customer_email, customer_name, title, organization_id, final_price, total_price,
        schedule_events!schedule_event_id(date, start_time, end_time, scenario, store_id)
      `)
      .eq('id', reservationId)
      .single()

    if (fetchError || !reservation) {
      logger.error('予約情報取得エラー:', fetchError)
      throw new Error('予約情報の取得に失敗しました')
    }

    logger.log('予約情報取得:', reservation)

    // user_id でプラットフォーム共通の顧客レコードを取得（organization_id は不要）
    const { data: customerRow, error: customerErr } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (customerErr) {
      logger.error('顧客ID取得エラー:', customerErr)
      throw new Error('顧客情報の取得に失敗しました')
    }
    const scopedCustomerId = customerRow?.id ?? null

    // 予約の所有者を確認
    if (reservation.customer_id && reservation.customer_id !== scopedCustomerId) {
      throw new Error('この予約を変更する権限がありません')
    }

    const oldCount = reservation.participant_count
    const unitPrice = reservation.unit_price || 0
    // 料金は常に unit_price × 人数 で計算
    const oldPrice = unitPrice * oldCount

    logger.log('人数変更前の情報:', {
      oldCount,
      newCount,
      unitPrice,
      oldPrice,
      newPrice: unitPrice * newCount,
      reservation_unit_price: reservation.unit_price,
      reservation_total_price: reservation.total_price,
      reservation_final_price: reservation.final_price
    })

    // RPC を呼び出して人数を変更（在庫ロック + 料金再計算含む）
    const result = await this.updateParticipantsWithLock(reservationId, newCount, scopedCustomerId)
    if (!result) {
      throw new Error('人数変更に失敗しました')
    }

    logger.log('人数変更成功（RPC内で完了）')

    // schedule_eventsのcurrent_participantsを再計算
    // ※ RPCで既に更新されているが、念のため再計算
    if (reservation.schedule_event_id) {
      try {
        await recalculateCurrentParticipants(reservation.schedule_event_id)
        logger.log('参加者数再計算完了')
      } catch (recalcError) {
        logger.warn('current_participants再計算エラー:', recalcError)
      }
    }

    // 人数変更確認メールを送信
    if (sendEmail && reservation.customer_email) {
      try {
        // 新料金は unit_price × newCount で計算
        const newPrice = unitPrice * newCount
        const priceDifference = newPrice - oldPrice
        const scheduleEventRaw = reservation.schedule_events as unknown
        const scheduleEvent = (Array.isArray(scheduleEventRaw) ? scheduleEventRaw[0] : scheduleEventRaw) as Record<string, unknown> | null | undefined

        const response = await supabase.functions.invoke('send-booking-change-confirmation', {
          body: {
            organizationId: reservation.organization_id,
            storeId: scheduleEvent?.store_id,
            reservationId: reservation.id,
            customerEmail: reservation.customer_email,
            customerName: reservation.customer_name || 'お客様',
            scenarioTitle: reservation.title || scheduleEvent?.scenario || 'シナリオ',
            reservationNumber: reservation.reservation_number,
            changes: [
              {
                field: 'participant_count',
                label: '参加人数',
                oldValue: `${oldCount}名`,
                newValue: `${newCount}名`
              },
              {
                field: 'total_price',
                label: 'お支払い金額',
                oldValue: `¥${oldPrice.toLocaleString()}`,
                newValue: `¥${newPrice.toLocaleString()}`
              }
            ],
            newParticipantCount: newCount,
            newTotalPrice: newPrice,
            priceDifference: priceDifference
          }
        })

        const outcome = notificationOutcome(response)
        if (outcome.status !== 'accepted') {
          logger.warn('人数変更は保存済み・通知メール未確認:', { reservationId, ...outcome })
        } else {
          logger.log('人数変更確認メール受付確認')
        }
      } catch (emailError) {
        logger.error('人数変更確認メール送信エラー:', emailError)
        // メール送信失敗しても人数変更処理は成功として扱う
      }
    }

    return true
  },

  // 予約を更新
  // バックエンド API (/api/reservations?action=update) 経由で org_id を強制フィルタ + 所有検証。
  // sendEmail=true の場合は更新前後の差分を計算して送信用 Edge Function を呼ぶ（従来通り）。
  async update(id: string, updates: Partial<Reservation>, sendEmail: boolean = false): Promise<Reservation> {
    // 変更前のデータを取得（メール送信用）
    type OriginalReservationForEmail = {
      participant_count?: number
      total_price?: number
    } & Record<string, unknown>
    let originalReservation: OriginalReservationForEmail | null = null
    if (sendEmail) {
      const { data: original, error: fetchError } = await supabase
        .from('reservations')
        .select(RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      originalReservation = original
    }

    // 更新（サーバー側で admin_update_reservation_fields RPC を呼ぶ）
    // 戻り値は RESERVATION_FOR_UPDATE_EMAIL_SELECT_FIELDS 形式
    const data = await apiClient.patch<Reservation & {
      customers?: Customer | Customer[] | null
      schedule_events?: Record<string, unknown> | Record<string, unknown>[] | null
    }>(
      `/api/reservations?action=update&id=${encodeURIComponent(id)}`,
      { updates }
    )

    // 変更確認メールを送信（sendEmail=trueの場合のみ）
    if (sendEmail && originalReservation && joinedCustomerFromReservation(data.customers)) {
      try {
        const changes: Array<{field: string; label: string; oldValue: string; newValue: string}> = []

        // 参加人数の変更
        if (updates.participant_count && originalReservation.participant_count !== updates.participant_count) {
          changes.push({
            field: 'participant_count',
            label: '参加人数',
            oldValue: `${originalReservation.participant_count}名`,
            newValue: `${updates.participant_count}名`
          })
        }

        // 料金の変更
        if (updates.total_price && originalReservation.total_price !== updates.total_price) {
          changes.push({
            field: 'total_price',
            label: '料金',
            oldValue: `¥${(originalReservation.total_price ?? 0).toLocaleString()}`,
            newValue: `¥${updates.total_price.toLocaleString()}`
          })
        }

        // 変更がある場合のみメール送信
        if (changes.length > 0) {
          const scheduleEventRaw = Array.isArray(data.schedule_events) ? data.schedule_events[0] : data.schedule_events
          const scheduleEvent = scheduleEventRaw as Record<string, unknown> | null | undefined
          const priceDifference = updates.total_price
            ? updates.total_price - (originalReservation.total_price || 0)
            : 0
          const cust = joinedCustomerFromReservation(data.customers)

          const response = await supabase.functions.invoke('send-booking-change-confirmation', {
            body: {
              organizationId: data.organization_id,
              storeId: scheduleEvent?.store_id,
              reservationId: data.id,
              customerEmail: cust?.email,
              customerName: cust?.name,
              scenarioTitle: data.title || scheduleEvent?.scenario,
              reservationNumber: data.reservation_number,
              changes,
              newEventDate: scheduleEvent?.date,
              newStartTime: scheduleEvent?.start_time,
              newEndTime: scheduleEvent?.end_time,
              newStoreName: scheduleEvent?.venue,
              newParticipantCount: data.participant_count,
              newTotalPrice: data.total_price,
              priceDifference: priceDifference !== 0 ? priceDifference : undefined
            }
          })
          const outcome = notificationOutcome(response)
          if (outcome.status === 'accepted') logger.log('予約変更確認メール受付確認')
          else logger.warn('予約変更は保存済み・通知メール未確認:', { reservationId: id, ...outcome })
        }
      } catch (emailError) {
        logger.error('予約変更確認メール送信エラー:', emailError)
        // メール送信失敗しても更新処理は続行
      }
    }

    return data as Reservation
  },

  // 予約をキャンセル
  // バックエンド API (/api/reservations?action=cancel) で DB 部分を一括処理し、
  // メール送信 / Discord 通知 / waitlist 通知などの Edge Function 呼び出しは
  // 引き続きクライアント側で実行する（既存挙動の維持）。
  // options.cancelPrivateEvent: true のとき、紐づく貸切公演(category='private')も中止にする
  async cancel(id: string, cancellationReason?: string, options?: { skipGroupCancel?: boolean; customEmailBody?: string; skipCancellationEmail?: boolean; cancelledBy?: 'customer' | 'store'; cancelPrivateEvent?: boolean; privateRejectionBody?: string }): Promise<Reservation> {
    // ⚠️ P1-12: 相関ID — キャンセル→メール→通知を一つのフローとして追跡
    const clog = createCorrelatedLogger(generateCorrelationId(), 'cancel')
    clog.info('キャンセル開始', { reservationId: id })

    // サーバー側で予約 fetch + RPC キャンセル + システムメッセージ送信まで実施
    type ReservationCancelContext = Reservation & {
      customers?: Customer | Customer[] | null
      schedule_events?: Record<string, unknown> | Record<string, unknown>[] | null
      customer_name?: string | null
      customer_email?: string | null
      private_group_id?: string | null
    }
    const orchestrated = await apiClient.patch<{
      reservation: Reservation
      contextForNotifications: {
        reservation: ReservationCancelContext
        organization_slug: string | null
        skip_group_cancel: boolean
      }
    }>(
      `/api/reservations?action=cancel&id=${encodeURIComponent(id)}`,
      {
        cancellation_reason: cancellationReason ?? null,
        skip_group_cancel: Boolean(options?.skipGroupCancel),
        cancel_private_event: Boolean(options?.cancelPrivateEvent),
        private_rejection_body: options?.privateRejectionBody,
      }
    )

    const data = orchestrated.reservation
    const ctx = orchestrated.contextForNotifications
    const reservation = ctx.reservation

    if (reservation?.private_group_id && !options?.skipGroupCancel) {
      clog.info('予約+グループをatomicにキャンセル + システムメッセージ送信', {
        reservationId: id,
        groupId: reservation.private_group_id,
      })
    }

    // キャンセル確認メールを送信
    const cancelMailCustomer = joinedCustomerFromReservation(reservation?.customers)
    // 貸切予約など customers.email が null の場合は reservation.customer_email をフォールバックとして使う
    const cancelMailEmail = cancelMailCustomer?.email || reservation?.customer_email || null
    const cancelMailName = cancelMailCustomer?.name || reservation?.customer_name || null
    if (reservation && cancelMailEmail) {
      try {
        const scheduleEvent = Array.isArray(reservation.schedule_events) ? reservation.schedule_events[0] : reservation.schedule_events
        const storeName = scheduleEvent?.venue || '店舗不明'

        // 却下フローなど、別経路で顧客連絡を行うケースはキャンセル確認メールを送らない
        // （DB キャンセル・在庫返却・キャンセル待ち通知は従来どおり実施する）。
        if (!options?.skipCancellationEmail) {
          // 料金はサーバーに保存された受付時刻・予約ポリシーから解決する。
          // ブラウザでは時刻や料金を再計算しない。

          // ⚠️ P1-8: べき等性キー（同じキャンセルに対する重複通知を防止）
          const idempotencyKey = `cancel-confirm-${reservation.id}-${Date.now()}`
          const orgIdForEmail = reservation.organization_id || scheduleEvent?.organization_id
          const response = await supabase.functions.invoke('send-cancellation-confirmation', {
            body: {
              organizationId: orgIdForEmail,
              storeId: scheduleEvent?.store_id,
              reservationId: reservation.id,
              customerEmail: cancelMailEmail,
              customerName: cancelMailName,
              scenarioTitle: reservation.title || scheduleEvent?.scenario,
              eventDate: scheduleEvent?.date,
              startTime: scheduleEvent?.start_time,
              endTime: scheduleEvent?.end_time,
              storeName,
              participantCount: reservation.participant_count,
              totalPrice: reservation.total_price || 0,
              reservationNumber: reservation.reservation_number,
              // スタッフ起点の中止・削除は 'store'（公演中止文面・件名）。既定は顧客都合キャンセル。
              cancelledBy: options?.cancelledBy ?? 'customer',
              cancellationReason: cancellationReason || 'お客様のご都合によるキャンセル',
              // 中止・削除フローのメール編集ダイアログで全文編集された本文（あれば優先）
              customEmailBody: options?.customEmailBody,
              idempotencyKey
            }
          })
          const outcome = notificationOutcome(response)
          if (outcome.status === 'accepted') logger.log('キャンセル確認メール受付確認', { reservationId: id })
          else if (outcome.status === 'skipped') logger.log('キャンセル確認メール送信スキップ', { reservationId: id, ...outcome })
          else logger.warn('予約取消は保存済み・通知メール未確認', { reservationId: id, ...outcome })
          // user_notifications への挿入は send-cancellation-confirmation Edge Function 内で Service Role を使って実行
        }

        // キャンセル待ち通知を送信
        const orgIdForWaitlist = reservation.organization_id || scheduleEvent?.organization_id
        if (reservation.schedule_event_id && orgIdForWaitlist) {
          // 組織のslugはサーバー側で取得済み（ctx.organization_slug）
          try {
            // ⚠️ P1-8: べき等性キー（同じキャンセルに対する重複待ちリスト通知を防止）
            const waitlistIdempotencyKey = `waitlist-notify-${reservation.id}-${reservation.schedule_event_id}`
            const notificationData = {
              organizationId: orgIdForWaitlist,
              scheduleEventId: reservation.schedule_event_id,
              freedSeats: reservation.participant_count,
              scenarioTitle: reservation.title || scheduleEvent?.scenario,
              eventDate: scheduleEvent?.date,
              startTime: scheduleEvent?.start_time,
              endTime: scheduleEvent?.end_time,
              storeName,
              idempotencyKey: waitlistIdempotencyKey
              // bookingUrl を削除（サーバー側で生成）
            }

            const response = await supabase.functions.invoke('notify-waitlist', {
              body: notificationData
            })
            const outcome = waitlistNotificationOutcome(response)
            if (outcome.status === 'accepted') logger.log('キャンセル待ち通知受付確認', { reservationId: id })
            else logger.warn('予約取消は保存済み・キャンセル待ち通知未確認', { reservationId: id, ...outcome })
            // 返却失敗をthrowへ変換しない。Edge内部で一部送信済みでも二重queueを作らない。
          } catch (waitlistError) {
            logger.error('キャンセル待ち通知エラー:', waitlistError)

            // 通知失敗をキューに記録（リトライ用）
            try {
              const { error: queueResultError } = await supabase.from('waitlist_notification_queue').insert({
                schedule_event_id: reservation.schedule_event_id,
                organization_id: orgIdForWaitlist,
                freed_seats: reservation.participant_count,
                scenario_title: reservation.title || scheduleEvent?.scenario,
                event_date: scheduleEvent?.date,
                start_time: scheduleEvent?.start_time,
                end_time: scheduleEvent?.end_time,
                store_name: storeName,
                // booking_url は削除（サーバー側で生成）
                last_error: waitlistError instanceof Error ? waitlistError.message : String(waitlistError),
                status: 'pending'
              })
              if (queueResultError) logger.warn('予約取消は保存済み・待機列キュー記録未確認', { reservationId: id, reason: 'queue_insert_error' })
              else logger.log('キャンセル待ち通知をリトライキューに記録')
            } catch (queueError) {
              logger.error('リトライキュー記録エラー:', queueError)
              // キューへの記録失敗は無視（キャンセル処理自体は成功）
            }
          }
        }
      } catch (emailError) {
        logger.error('キャンセル確認メール送信エラー:', emailError)
        // メール送信失敗してもキャンセル処理は続行
      }
    }

    // 貸切予約のキャンセル時、担当GMにDiscord通知を送信
    const scheduleEventForGMRaw = Array.isArray(reservation?.schedule_events)
      ? reservation.schedule_events[0]
      : reservation?.schedule_events
    const scheduleEventForGM = scheduleEventForGMRaw as
      | (Record<string, unknown> & {
          is_private_booking?: boolean | null
          gms?: string[] | null
          organization_id?: string | null
          id?: string | null
          scenario?: string | null
          date?: string | null
          start_time?: string | null
          end_time?: string | null
          venue?: string | null
          store_id?: string | null
        })
      | null
      | undefined

    // GM通知はDBの取消トリガーで永続キューへ記録する（顧客メールと独立）。

    await markSenshinDiscordCancelled({
      reservationId: reservation.id,
      organizationId: reservation.organization_id || scheduleEventForGM?.organization_id,
      scenario_master_id: reservation.scenario_master_id,
      scenario_title: reservation.title || scheduleEventForGM?.scenario,
    })

    return data as Reservation
  },

  // 予約を削除
  async delete(id: string): Promise<void> {
    await apiClient.delete<{ success: boolean }>(`/api/reservations?id=${encodeURIComponent(id)}`)
  },

  // 予約サマリーを取得
  async getSummary(scheduleEventId?: string): Promise<ReservationSummary[]> {
    const url = scheduleEventId
      ? `/api/reservations?type=summary&schedule_event_id=${encodeURIComponent(scheduleEventId)}`
      : '/api/reservations?type=summary'
    return apiClient.get<ReservationSummary[]>(url)
  },

  // スケジュールイベントの空席状況を取得
  async getAvailability(scheduleEventId: string): Promise<{
    maxParticipants: number | null
    currentReservations: number
    availableSeats: number
  }> {
    return apiClient.get<{
      maxParticipants: number | null
      currentReservations: number
      availableSeats: number
    }>(`/api/reservations?type=availability&schedule_event_id=${encodeURIComponent(scheduleEventId)}`)
  },

  async getStaffParticipation(eventId: string): Promise<{ entries: StaffParticipationEntry[]; reservations: StaffParticipationReservation[]; assignment: StaffParticipationPlan['expectedStaff'] }> {
    return apiClient.get(`/api/reservations?type=staff-participation&schedule_event_id=${encodeURIComponent(eventId)}`)
  },

  // 全員分を同じDBトランザクションで保存。名前による自動照合・個別取消はしない。
  async syncStaffReservations(
    eventId: string,
    gms: string[],
    gmRoles: Record<string, string>,
    _eventDetails?: { date: string; start_time: string; scenario_master_id?: string; scenario_title?: string; store_id?: string; duration?: number },
    plan?: StaffParticipationPlan,
  ): Promise<void> {
    if (!plan) throw new Error('スタッフ参加方法を確認できません。公演を開き直してください。')
    await apiClient.post('/api/reservations?action=sync-staff-participation', {
      schedule_event_id: eventId, entries: plan.entries, expected: plan.expected, gms, gm_roles: gmRoles, expected_staff: plan.expectedStaff,
    })
  }
}
