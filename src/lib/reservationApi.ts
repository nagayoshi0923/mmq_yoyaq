import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import { logger, generateCorrelationId, createCorrelatedLogger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { STAFF_RESERVATION_SOURCES, AUTO_MANAGED_STAFF_SOURCES } from '@/lib/constants'
import type { Reservation, Customer, ReservationSummary } from '@/types'

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
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes' as const

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

  // 予約をキャンセル（RPC + FOR UPDATE をサーバー側で実施）
  async cancelWithLock(reservationId: string, customerId: string | null, reason?: string): Promise<boolean> {
    await apiClient.patch<{ success: boolean }>(
      `/api/reservations?action=cancel-with-lock&id=${encodeURIComponent(reservationId)}`,
      {
        customer_id: customerId,
        cancellation_reason: reason ?? null,
      }
    )
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

        const { error: emailError } = await supabase.functions.invoke('send-booking-change-confirmation', {
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

        if (emailError) {
          logger.error('人数変更確認メール送信エラー:', emailError)
        } else {
          logger.log('人数変更確認メール送信成功')
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

          await supabase.functions.invoke('send-booking-change-confirmation', {
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
          logger.log('予約変更確認メール送信成功')
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
  async cancel(id: string, cancellationReason?: string, options?: { skipGroupCancel?: boolean; customEmailBody?: string; skipCancellationEmail?: boolean; cancelledBy?: 'customer' | 'store' }): Promise<Reservation> {
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
          // キャンセル料金を計算（ここでは簡易実装: 24時間前以降は100%）
          const eventDateTime = new Date(`${scheduleEvent?.date}T${scheduleEvent?.start_time}`)
          const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
          const cancellationFee = hoursUntilEvent < 24 ? (reservation.total_price || 0) : 0

          // ⚠️ P1-8: べき等性キー（同じキャンセルに対する重複通知を防止）
          const idempotencyKey = `cancel-confirm-${reservation.id}-${Date.now()}`
          const orgIdForEmail = reservation.organization_id || scheduleEvent?.organization_id
          await supabase.functions.invoke('send-cancellation-confirmation', {
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
              cancellationFee,
              // 中止・削除フローのメール編集ダイアログで全文編集された本文（あれば優先）
              customEmailBody: options?.customEmailBody,
              idempotencyKey
            }
          })
          logger.log('キャンセル確認メール送信成功')
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

            await supabase.functions.invoke('notify-waitlist', {
              body: notificationData
            })
            logger.log('キャンセル待ち通知送信成功')
          } catch (waitlistError) {
            logger.error('キャンセル待ち通知エラー:', waitlistError)

            // 通知失敗をキューに記録（リトライ用）
            try {
              await supabase.from('waitlist_notification_queue').insert({
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
              logger.log('キャンセル待ち通知をリトライキューに記録')
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

    if (scheduleEventForGM?.is_private_booking && (scheduleEventForGM.gms?.length ?? 0) > 0) {
      try {
        const orgId = reservation.organization_id || scheduleEventForGM.organization_id
        const gmNotifyCustomer = joinedCustomerFromReservation(reservation.customers)

        await supabase.functions.invoke('notify-private-booking-cancelled-discord', {
          body: {
            organizationId: orgId,
            scheduleEventId: scheduleEventForGM.id,
            gms: scheduleEventForGM.gms,
            customerName: gmNotifyCustomer?.name || reservation.customer_name || '顧客',
            scenarioTitle: reservation.title || scheduleEventForGM.scenario || 'シナリオ未定',
            eventDate: scheduleEventForGM.date,
            startTime: scheduleEventForGM.start_time,
            endTime: scheduleEventForGM.end_time,
            storeName: scheduleEventForGM.venue || '店舗不明',
            storeId: scheduleEventForGM.store_id,
            cancellationReason: cancellationReason || 'お客様のご都合によるキャンセル'
          }
        })
        logger.log('貸切キャンセルGM通知送信成功')
      } catch (gmNotifyError) {
        logger.error('貸切キャンセルGM通知エラー:', gmNotifyError)
        // 通知失敗してもキャンセル処理は成功とする
      }
    }

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

  // スタッフ参加の予約を同期する関数
  // GM欄の「スタッフ参加」と予約データを同期
  // ※ 手動追加された予約（staff_participation, walk_in, web等）は削除しない
  async syncStaffReservations(
    eventId: string,
    gms: string[],
    gmRoles: Record<string, string>,
    eventDetails?: {
      date: string,
      start_time: string,
      scenario_master_id?: string,
      scenario_title?: string,
      store_id?: string,
      duration?: number
    }
  ): Promise<void> {
    try {
      // 1. スタッフ参加のGMリストを作成
      const staffParticipants = gms.filter(gm => gmRoles[gm] === 'staff')

      // 2. 現在の予約を取得（サーバー側で org_id 強制フィルタ）
      const currentReservations = await this.getByScheduleEvent(eventId)

      // 3. すべてのアクティブなスタッフ予約を抽出（重複チェック用）
      // ※ キャンセル済みは除外して、アクティブな予約のみを対象にする
      const activeStaffReservations = currentReservations.filter(r =>
        r.status !== 'cancelled' && (
          (STAFF_RESERVATION_SOURCES as readonly string[]).includes(r.reservation_source ?? '') ||
          r.payment_method === 'staff'
        )
      )

      // 4. スタッフ予約として管理している予約を抽出（削除対象の候補）
      // ※ staff_entry（GM欄から自動作成）のみが対象
      // ※ staff_participation（予約者タブから手動追加）は保護 — GM欄と独立した手動操作のため
      // ※ web（予約サイト）や walk_in（当日飛び込み）は保護
      const managedStaffReservations = currentReservations.filter(r =>
        (AUTO_MANAGED_STAFF_SOURCES as readonly string[]).includes(r.reservation_source ?? '')
      )

      // 5. 追加が必要なスタッフ（アクティブな予約のみをチェック）
      // ※ 名前の完全一致で比較（trimして比較）
      const toAdd = staffParticipants.filter(staffName => {
        const trimmedName = staffName.trim()
        return !activeStaffReservations.some(r =>
          r.participant_names?.some(name => name.trim() === trimmedName)
        )
      })

      // 6. 削除が必要なスタッフ予約
      // GM欄のスタッフ参加リストに含まれていない staff_entry 予約を削除
      // ※ staff_participation は手動追加のため自動削除しない
      // ※ web, walk_in 等は保護（一般顧客の予約を誤削除しない）
      // ※ 名前の完全一致で比較（trimして比較）
      const toRemove = managedStaffReservations.filter(r =>
        !r.participant_names?.some(name =>
          staffParticipants.some(sp => sp.trim() === name.trim())
        )
      )

      logger.log('🔄 スタッフ予約同期:', {
        staffParticipants,
        activeStaffReservations: activeStaffReservations.map(r => ({
          id: r.id,
          name: r.participant_names,
          source: r.reservation_source,
          status: r.status
        })),
        toAdd,
        toRemove: toRemove.map(r => ({
          id: r.id,
          name: r.participant_names,
          source: r.reservation_source,
          status: r.status
        }))
      })

      // 7. 実行
      // 追加: 専用エンドポイント /api/reservations?action=create-staff-entry を呼ぶ
      // （通常の create_reservation_with_lock_v2 RPC は payment_method='staff' /
      //   reservation_source='staff_entry' / participant_names をサポートしないため）
      // スタッフ複数人いる時のラウンドトリップを減らすため Promise.all で並列化
      if (eventDetails && toAdd.length > 0) {
        await Promise.all(toAdd.map(async (staffName) => {
          logger.log('📝 スタッフ予約を作成:', { staffName })
          try {
            await apiClient.post('/api/reservations?action=create-staff-entry', {
              schedule_event_id: eventId,
              staff_name: staffName,
              event_details: {
                date: eventDetails.date,
                start_time: eventDetails.start_time,
                scenario_master_id: eventDetails.scenario_master_id ?? null,
                scenario_title: eventDetails.scenario_title ?? null,
                store_id: eventDetails.store_id ?? null,
                duration: eventDetails.duration ?? 120,
              },
            })
          } catch (insertError) {
            logger.error('スタッフ予約作成エラー:', insertError)
          }
        }))
      }

      // 削除（キャンセル）- staff_entry が対象
      // バックエンド経由で一括ステータス更新する（旧実装の for-await update よりも N+1 回避）
      const activeToRemoveIds = toRemove
        .filter(r => r.status !== 'cancelled')
        .map(r => r.id)
      if (activeToRemoveIds.length > 0) {
        try {
          await apiClient.patch('/api/reservations?action=sync-staff-reservation-statuses', {
            reservation_ids: activeToRemoveIds,
            status: 'cancelled',
          })
          for (const res of toRemove.filter(r => r.status !== 'cancelled')) {
            logger.log('🗑️ スタッフ予約を削除:', { name: res.participant_names, source: res.reservation_source })
          }
        } catch (removeError) {
          logger.error('スタッフ予約一括キャンセルエラー:', removeError)
        }
      }

      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
      // 相対的な加減算ではなく、常に予約テーブルから集計して絶対値を設定
      const addedCount = toAdd.length
      const removedCount = activeToRemoveIds.length

      if (addedCount > 0 || removedCount > 0) {
        try {
          const newCount = await recalculateCurrentParticipants(eventId)
          logger.log('📊 current_participants再計算:', { eventId, newCount })
        } catch (updateError) {
          logger.error('参加者数の更新エラー:', updateError)
        }
      }
    } catch (error) {
      logger.error('スタッフ予約同期エラー:', error)
    }
  }
}

