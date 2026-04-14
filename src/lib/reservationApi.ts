import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger, generateCorrelationId, createCorrelatedLogger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import { RESERVATION_SOURCE, STAFF_RESERVATION_SOURCES, AUTO_MANAGED_STAFF_SOURCES, GLOBAL_SETTINGS_MSG_SELECT } from '@/lib/constants'
import type { Reservation, Customer, ReservationSummary } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const CUSTOMER_SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at' as const

/** 予約一覧・モーダル等で共通利用（select('*') 回避用） */
/** DB に scenario_title 列はない。シナリオ表示名は title（および必要なら schedule_events.scenario）を使う */
export const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, scenario_master_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, private_group_id, candidate_datetimes' as const

/** 予約 + customers（貸切・公演モーダル・中止処理など） */
export const RESERVATION_WITH_CUSTOMER_SELECT_FIELDS =
  `${RESERVATION_SELECT_FIELDS}, customers(${CUSTOMER_SELECT_FIELDS})` as const

const SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL =
  'schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario, store_id)'

/** 予約変更メール用（予約 + 顧客 + 公演スナップショット） */
const RESERVATION_FOR_UPDATE_WITH_RELATIONS_SELECT =
  `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_UPDATE_EMAIL}` as const

const SCHEDULE_EVENT_EMBED_FOR_CANCEL =
  'schedule_events!schedule_event_id(id, date, start_time, end_time, venue, scenario, organization_id, is_private_booking, gms, store_id)'

/** キャンセルフロー初期取得（メール・GM・貸切グループ用） */
const RESERVATION_FOR_CANCEL_FETCH_SELECT =
  `${RESERVATION_WITH_CUSTOMER_SELECT_FIELDS}, ${SCHEDULE_EVENT_EMBED_FOR_CANCEL}` as const

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
export const customerApi = {
  // 全顧客を取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getAll(organizationId?: string): Promise<Customer[]> {
    // 組織フィルタリング
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('customers')
      .select(CUSTOMER_SELECT_FIELDS)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 顧客を作成
  async create(customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'visit_count' | 'total_spent'>): Promise<Customer> {
    // organization_idを自動取得（マルチテナント対応）
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }
    
    const { data, error } = await supabase
      .from('customers')
      .insert([{ ...customer, organization_id: organizationId }])
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 顧客を更新
  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    // ⚠️ Mass Assignment 防止: 更新可能フィールドのホワイトリスト
    const CUSTOMER_UPDATABLE_FIELDS = [
      'name', 'email', 'phone', 'nickname', 'line_name', 'notes', 'status',
      'preferred_staff', 'visit_count', 'last_visit_date', 'reservation_count',
      'discord_user_id', 'avatar_url',
    ] as const
    const safeUpdates: Record<string, unknown> = {}
    for (const key of Object.keys(updates)) {
      if ((CUSTOMER_UPDATABLE_FIELDS as readonly string[]).includes(key)) {
        safeUpdates[key] = (updates as Record<string, unknown>)[key]
      }
    }

    const { data, error } = await supabase
      .from('customers')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // メールアドレスで検索
  async findByEmail(email: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT_FIELDS)
      .eq('email', email)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },

  // 電話番号で検索
  async findByPhone(phone: string): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT_FIELDS)
      .eq('phone', phone)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },

  // 顧客を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  }
}

// 予約関連のAPI
export const reservationApi = {
  // 全予約を取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getAll(organizationId?: string): Promise<Reservation[]> {
    // 組織フィルタリング
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('requested_datetime', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 特定期間の予約を取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getByDateRange(startDate: string, endDate: string, organizationId?: string): Promise<Reservation[]> {
    // 組織フィルタリング
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
      .gte('requested_datetime', startDate)
      .lte('requested_datetime', endDate)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('requested_datetime', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // スケジュールイベントIDで予約を取得
  // organizationId を渡せるようにする（管理画面で「閲覧中の組織」とログインユーザー組織が異なるケース対策）
  async getByScheduleEvent(scheduleEventId: string, organizationId?: string | null): Promise<Reservation[]> {
    // organization_idを自動取得（マルチテナント対応）
    const orgId = organizationId ?? await getCurrentOrganizationId()

    const run = async (select: string) => {
      let query = supabase
        .from('reservations')
        .select(select)
        .eq('schedule_event_id', scheduleEventId)
        .in('status', ['pending', 'confirmed', 'gm_confirmed', 'checked_in', 'cancelled'])

      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      return await query.order('created_at', { ascending: true })
    }

    const explicit = await run(RESERVATION_WITH_CUSTOMER_SELECT_FIELDS)
    if (!explicit.error) {
      return (explicit.data as unknown as Reservation[]) || []
    }

    // migration 未適用などで列不足の環境では明示列が 400 になることがあるためフォールバック
    logger.warn('getByScheduleEvent: explicit select failed, falling back to *', {
      scheduleEventId,
      orgId,
      error: explicit.error,
    })
    const fallback = await run('*, customers(*)')
    if (!fallback.error) {
      return (fallback.data as unknown as Reservation[]) || []
    }

    logger.error('getByScheduleEvent: both selects failed', {
      scheduleEventId,
      orgId,
      explicitError: explicit.error,
      fallbackError: fallback.error,
    })
    throw fallback.error
  },

  // 顧客IDで予約を取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getByCustomer(customerId: string, organizationId?: string): Promise<Reservation[]> {
    // 組織フィルタリング（マルチテナント対応: 他組織の予約が漏れないように）
    const orgId = organizationId || await getCurrentOrganizationId()
    
    let query = supabase
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
      .eq('customer_id', customerId)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query.order('requested_datetime', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 予約を作成（RPC + FOR UPDATE）
  async create(reservation: CreateReservationWithLockParams): Promise<Reservation> {
    const organizationId = reservation.organization_id || await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }

    // 予約番号を自動生成（YYMMDD-XXXX形式: 11桁）
    // 冪等性: 呼び出し元が reservation_number を渡す場合はそれを優先して使用する
    const reservationNumber = reservation.reservation_number || (() => {
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
      const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
      return `${dateStr}-${randomStr}`
    })()

    // 🔒 SEC-P0-01対策: v2のみを使用（レガシーフォールバック削除）
    // - v2はサーバー側で料金/日時を確定し、クライアント入力の改ざんを防止
    // - 旧関数（料金検証なし）へのフォールバックは削除
    let reservationId: string | null = null
    let error: any = null

    const res = await supabase.rpc('create_reservation_with_lock_v2', {
      p_schedule_event_id: reservation.schedule_event_id,
      p_participant_count: reservation.participant_count,
      p_customer_id: reservation.customer_id,
      p_customer_name: reservation.customer_name ?? null,
      p_customer_email: reservation.customer_email ?? null,
      p_customer_phone: reservation.customer_phone ?? null,
      p_notes: reservation.customer_notes ?? null,
      p_how_found: (reservation as any).how_found ?? null,
      p_reservation_number: reservationNumber,
      p_customer_coupon_id: (reservation as any).customer_coupon_id ?? null
    })

    if (!res.error) {
      reservationId = res.data as any
    } else {
      error = res.error
    }

    if (error) {
      logger.error('予約作成RPCエラー:', error)
      // 冪等性: reservation_number が UNIQUE の場合、二重作成は 23505 で落ちる。
      // その場合は既存の予約を取得して成功扱いにする（UIのリトライ/二重送信対策）
      const errorCode = String((error as any).code || '')
      const errorMsg = String((error as any).message || '')
      const isUniqueViolation =
        errorCode === '23505' ||
        errorMsg.includes('reservation_number') ||
        errorMsg.includes('duplicate') ||
        errorMsg.includes('unique')
      if (isUniqueViolation && reservationNumber) {
        try {
          const { data: existing, error: existingError } = await supabase
            .from('reservations')
            .select(RESERVATION_SELECT_FIELDS)
            .eq('reservation_number', reservationNumber)
            .single()

          if (!existingError && existing) {
            return existing
          }
        } catch (fetchExistingError) {
          logger.warn('既存予約の取得に失敗（冪等性フォールバック）:', fetchExistingError)
        }
      }
      if (error.code === 'P0003') {
        throw new Error('この公演は満席です')
      }
      if (error.code === 'P0004') {
        throw new Error('選択した人数分の空席がありません')
      }
      if (error.code === 'P0002') {
        throw new Error('公演が見つかりません')
      }
      if (error.code === 'P0001') {
        throw new Error('参加人数が不正です')
      }
      throw error
    }

    const { data, error: fetchError } = await supabase
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
      .eq('id', reservationId)
      .single()

    if (fetchError) throw fetchError
    return data
  },

  // 予約をキャンセル（RPC + FOR UPDATE）
  async cancelWithLock(reservationId: string, customerId: string | null, reason?: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('cancel_reservation_with_lock', {
      p_reservation_id: reservationId,
      p_customer_id: customerId,
      p_cancellation_reason: reason ?? null
    })

    if (error) {
      logger.error('予約キャンセルRPCエラー:', error)
      throw error
    }

    // error が無くても false が返るケース（0行更新/権限/想定外）を失敗扱いにする
    if (data !== true) {
      logger.error('予約キャンセルRPCが成功扱いにならない:', {
        reservationId,
        customerId,
        data,
      })
      throw new Error('予約のキャンセルに失敗しました（DB側で処理できませんでした）')
    }

    return true
  },

  // 参加人数を変更（RPC + FOR UPDATE）
  async updateParticipantsWithLock(
    reservationId: string,
    newCount: number,
    customerId: string | null
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('update_reservation_participants', {
      p_reservation_id: reservationId,
      p_new_count: newCount,
      p_customer_id: customerId
    })

    if (error) {
      logger.error('参加人数更新RPCエラー:', error)
      if (error.code === 'P0008') {
        throw new Error('選択した人数分の空席がありません')
      }
      if (error.code === 'P0007') {
        throw new Error('予約が見つかりません')
      }
      if (error.code === 'P0006') {
        throw new Error('参加人数が不正です')
      }
      if (error.code === 'P0010') {
        throw new Error('権限がありません')
      }
      if (error.code === 'P0011') {
        throw new Error('権限がありません')
      }
      throw error
    }

    return Boolean(data)
  },

  // 料金/参加者名の再計算（サーバー側で実施）
  async recalculatePrices(reservationId: string, participantNames?: string[] | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('admin_recalculate_reservation_prices', {
      p_reservation_id: reservationId,
      p_participant_names: participantNames ?? null
    })
    if (error) throw error
    return !!data
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

    // 同一 user_id で複数組織の customers 行がある場合に誤マッチしないよう、予約の organization_id で絞る
    let customerQuery = supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
    if (reservation.organization_id) {
      customerQuery = customerQuery.eq('organization_id', reservation.organization_id)
    }
    const { data: customerRow, error: customerErr } = await customerQuery.maybeSingle()
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
        const scheduleEvent = reservation.schedule_events as any
        
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
  async update(id: string, updates: Partial<Reservation>, sendEmail: boolean = false): Promise<Reservation> {
    // 変更前のデータを取得（メール送信用）
    let originalReservation: any = null
    if (sendEmail) {
      const { data: original, error: fetchError } = await supabase
        .from('reservations')
        .select(RESERVATION_FOR_UPDATE_WITH_RELATIONS_SELECT)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      originalReservation = original
    }

    // 🚨 lint/no-restricted-syntax 対応: reservations はRPC経由で更新
    const { data: ok, error: updateError } = await supabase.rpc('admin_update_reservation_fields', {
      p_reservation_id: id,
      p_updates: updates as unknown as Record<string, unknown>
    })

    if (updateError) throw updateError
    if (!ok) throw new Error('予約の更新に失敗しました')

    // 更新後のデータを取得
    const { data, error } = await supabase
      .from('reservations')
      .select(RESERVATION_FOR_UPDATE_WITH_RELATIONS_SELECT)
      .eq('id', id)
      .single()

    if (error) throw error

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
            oldValue: `¥${originalReservation.total_price.toLocaleString()}`,
            newValue: `¥${updates.total_price.toLocaleString()}`
          })
        }

        // 変更がある場合のみメール送信
        if (changes.length > 0) {
          const scheduleEvent = Array.isArray(data.schedule_events) ? data.schedule_events[0] : data.schedule_events
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
  async cancel(id: string, cancellationReason?: string, options?: { skipGroupCancel?: boolean }): Promise<Reservation> {
    // ⚠️ P1-12: 相関ID — キャンセル→メール→通知を一つのフローとして追跡
    const clog = createCorrelatedLogger(generateCorrelationId(), 'cancel')
    clog.info('キャンセル開始', { reservationId: id })

    // 予約情報を取得（メール送信用、GM通知用にis_private_bookingとgmsも取得）
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select(RESERVATION_FOR_CANCEL_FETCH_SELECT)
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    if (!reservation) {
      throw new Error('予約情報の取得に失敗しました')
    }

    // customer_id が NULL でも動作するように修正（スタッフ予約・貸切予約対応）
    await reservationApi.cancelWithLock(id, reservation.customer_id ?? null, cancellationReason)
    
    // 貸切予約の場合、関連するグループもキャンセル状態に更新（skipGroupCancelオプションがない場合のみ）
    if (reservation.private_group_id && !options?.skipGroupCancel) {
      await supabase
        .from('private_groups')
        .update({ status: 'cancelled' })
        .eq('id', reservation.private_group_id)
      clog.info('グループステータスをキャンセルに更新', { groupId: reservation.private_group_id })
      
      // システムメッセージ設定を取得
      const { data: settings } = await supabase
        .from('global_settings')
        .select(GLOBAL_SETTINGS_MSG_SELECT.BOOKING_CANCELLED)
        .eq('organization_id', reservation.organization_id)
        .maybeSingle()
      
      const title = settings?.system_msg_booking_cancelled_title || 'ご予約がキャンセルされました'
      const body = settings?.system_msg_booking_cancelled_body || cancellationReason || '誠に申し訳ございませんが、やむを得ない事情によりご予約がキャンセルとなりました。'
      
      // グループチャットにシステムメッセージを送信
      await supabase
        .from('private_group_messages')
        .insert({
          group_id: reservation.private_group_id,
          sender_type: 'system',
          message: JSON.stringify({
            type: 'system',
            action: 'booking_cancelled',
            title,
            body
          })
        })
      clog.info('キャンセル通知をグループに送信', { groupId: reservation.private_group_id })
    }

    const { data, error } = await supabase
      .from('reservations')
      .select(RESERVATION_SELECT_FIELDS)
      .eq('id', id)
      .single()

    if (error) throw error

    // キャンセル確認メールを送信
    const cancelMailCustomer = joinedCustomerFromReservation(reservation.customers)
    if (reservation && cancelMailCustomer) {
      try {
        const scheduleEvent = Array.isArray(reservation.schedule_events) ? reservation.schedule_events[0] : reservation.schedule_events
        const storeName = scheduleEvent?.venue || '店舗不明'

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
            customerEmail: cancelMailCustomer.email,
            customerName: cancelMailCustomer.name,
            scenarioTitle: reservation.title || scheduleEvent?.scenario,
            eventDate: scheduleEvent?.date,
            startTime: scheduleEvent?.start_time,
            endTime: scheduleEvent?.end_time,
            storeName,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price || 0,
            reservationNumber: reservation.reservation_number,
            cancelledBy: 'customer',
            cancellationReason: cancellationReason || 'お客様のご都合によるキャンセル',
            cancellationFee,
            idempotencyKey
          }
        })
        logger.log('キャンセル確認メール送信成功')

        // 通知ダイアログ用（RLS でクライアント直接 INSERT が禁止の環境では 403 になる → メール送信は上で成功していれば続行）
        try {
          const eventDateStr = scheduleEvent?.date || ''
          const eventTimeStr = scheduleEvent?.start_time?.slice(0, 5) || ''
          const { error: notifInsertError } = await supabase
            .from('user_notifications')
            .insert({
              customer_id: reservation.customer_id,
              type: 'reservation_cancelled',
              title: '予約がキャンセルされました',
              message: `「${reservation.title || scheduleEvent?.scenario}」${eventDateStr} ${eventTimeStr}`,
              link: '/mypage',
              metadata: {
                reservationId: reservation.id,
                reservationNumber: reservation.reservation_number,
                scenarioTitle: reservation.title || scheduleEvent?.scenario,
                eventDate: eventDateStr,
                startTime: eventTimeStr,
                cancellationReason: cancellationReason || 'キャンセル'
              }
            })
          if (notifInsertError) {
            logger.warn(
              'キャンセル通知の user_notifications 挿入をスキップ（RLS または権限）:',
              notifInsertError
            )
          } else {
            logger.log('キャンセル通知をuser_notificationsに挿入')
          }
        } catch (notifError) {
          logger.warn('キャンセル通知の挿入に失敗（続行）:', notifError)
        }

        // キャンセル待ち通知を送信
        const orgIdForWaitlist = reservation.organization_id || scheduleEvent?.organization_id
        if (reservation.schedule_event_id && orgIdForWaitlist) {
          // 組織のslugを取得（tryの外で定義してcatchでも使えるようにする）
          let orgSlug = 'queens-waltz'
          try {
            const { data: org } = await supabase
              .from('organizations')
              .select('slug')
              .eq('id', orgIdForWaitlist)
              .single()
            
            orgSlug = org?.slug || 'queens-waltz'
          } catch (orgError) {
            logger.warn('組織slug取得エラー、デフォルト値を使用:', orgError)
          }
          
          // 🔒 SEC-P0-03対策: bookingUrl はサーバー側で生成（送信しない）
          
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
    const scheduleEventForGM = Array.isArray(reservation.schedule_events) 
      ? reservation.schedule_events[0] 
      : reservation.schedule_events
    
    if (scheduleEventForGM?.is_private_booking && scheduleEventForGM?.gms?.length > 0) {
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
    const { error } = await supabase.rpc('admin_delete_reservations_by_ids', {
      p_reservation_ids: [id]
    })
    if (error) throw error
  },

  // 予約サマリーを取得
  async getSummary(scheduleEventId?: string): Promise<ReservationSummary[]> {
    let query = supabase
      .from('reservation_summary')
      .select('schedule_event_id, date, venue, scenario, start_time, end_time, max_participants, current_reservations, available_seats, reservation_count')
    
    if (scheduleEventId) {
      query = query.eq('schedule_event_id', scheduleEventId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // スケジュールイベントの空席状況を取得
  async getAvailability(scheduleEventId: string): Promise<{
    maxParticipants: number | null
    currentReservations: number
    availableSeats: number
  }> {
    const { data, error } = await supabase
      .from('reservation_summary')
      .select('schedule_event_id, max_participants, current_reservations, available_seats')
      .eq('schedule_event_id', scheduleEventId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        // データがない場合は0で返す
        return {
          maxParticipants: null,
          currentReservations: 0,
          availableSeats: 0
        }
      }
      throw error
    }
    
    return {
      maxParticipants: data.max_participants,
      currentReservations: data.current_reservations,
      availableSeats: data.available_seats
    }
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

      // 2. 現在の予約を取得
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
      // 追加（スタッフ予約は通常のRPCではなく直接INSERTを使用）
      // ※ create()はcreate_reservation_with_lock_v2 RPCを使用するが、
      //    このRPCはpayment_method, reservation_source, participant_namesをサポートしていないため
      if (eventDetails && toAdd.length > 0) {
        // organization_idを取得
        const organizationId = await getCurrentOrganizationId()
        if (!organizationId) {
          throw new Error('組織情報が取得できません')
        }

        for (const staffName of toAdd) {
          // 予約番号を生成
          const now = new Date()
          const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
          const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
          const reservationNumber = `${dateStr}-${randomStr}`

          const staffReservation = {
            organization_id: organizationId,
            schedule_event_id: eventId,
            reservation_number: reservationNumber,
            title: eventDetails.scenario_title || '',
            scenario_master_id: eventDetails.scenario_master_id || null,
            store_id: eventDetails.store_id || null,
            customer_id: null,
            customer_notes: staffName,
            requested_datetime: `${eventDetails.date}T${eventDetails.start_time}+09:00`,
            duration: eventDetails.duration || 120,
            participant_count: 1,
            participant_names: [staffName],
            assigned_staff: [], 
            base_price: 0,
            options_price: 0,
            total_price: 0,
            discount_amount: 0,
            final_price: 0,
            payment_method: 'staff',
            payment_status: 'paid',
            status: 'confirmed',
            reservation_source: RESERVATION_SOURCE.STAFF_ENTRY
          }

          logger.log('📝 スタッフ予約を作成:', { staffName, reservationNumber })
          
          const { error: insertError } = await supabase
            .from('reservations')
            .insert([staffReservation])

          if (insertError) {
            logger.error('スタッフ予約作成エラー:', insertError)
          }
        }
      }

      // 削除（キャンセル）- staff_entry と staff_participation が対象
      for (const res of toRemove) {
        if (res.status !== 'cancelled') {
          logger.log('🗑️ スタッフ予約を削除:', { name: res.participant_names, source: res.reservation_source })
          await this.update(res.id, { status: 'cancelled' })
        }
      }

      // 🚨 CRITICAL: 参加者数を予約テーブルから再計算して更新
      // 相対的な加減算ではなく、常に予約テーブルから集計して絶対値を設定
      const addedCount = toAdd.length
      const removedCount = toRemove.filter(r => r.status !== 'cancelled').length
      
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

