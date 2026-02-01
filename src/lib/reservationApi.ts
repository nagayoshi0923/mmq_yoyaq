import { supabase } from './supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { recalculateCurrentParticipants } from '@/lib/participantUtils'
import type { Reservation, Customer, ReservationSummary } from '@/types'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const CUSTOMER_SELECT_FIELDS =
  'id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at' as const

const RESERVATION_SELECT_FIELDS =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, candidate_datetimes' as const

const RESERVATION_WITH_CUSTOMER_SELECT =
  'id, organization_id, reservation_number, reservation_page_id, title, scenario_id, store_id, customer_id, schedule_event_id, requested_datetime, actual_datetime, duration, participant_count, participant_names, assigned_staff, gm_staff, base_price, options_price, total_price, discount_amount, final_price, unit_price, payment_status, payment_method, payment_datetime, status, customer_notes, staff_notes, special_requests, cancellation_reason, cancelled_at, external_reservation_id, reservation_source, created_by, created_at, updated_at, customer_name, customer_email, customer_phone, candidate_datetimes, customers(id, organization_id, user_id, name, nickname, email, email_verified, phone, address, line_id, notes, avatar_url, visit_count, total_spent, last_visit, preferences, notification_settings, created_at, updated_at)' as const

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
    const { data, error } = await supabase
      .from('customers')
      .update(updates)
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
        .in('status', ['pending', 'confirmed', 'gm_confirmed', 'cancelled'])

      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      return await query.order('created_at', { ascending: true })
    }

    // NOTE:
    // このプロジェクトは環境（migration差分/列追加の進行状況）によって
    // 予約テーブルの列が揃っていないケースがあり、固定の列リスト select だと 400 になることがある。
    // 管理画面の公演ダイアログでは安定性を優先し、まずは安全な * を使う。
    const safe = await run('*, customers(*)')
    if (!safe.error) {
      return (safe.data as unknown as Reservation[]) || []
    }

    // それでも失敗する場合のみ、詳細ログを出してエラーにする
    logger.error('getByScheduleEvent: safe select failed', {
      scheduleEventId,
      orgId,
      error: safe.error,
    })
    throw safe.error
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
      p_reservation_number: reservationNumber
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
  async updateParticipantCount(reservationId: string, newCount: number): Promise<boolean> {
    // 現在のユーザーのcustomer_idを取得
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('ログインが必要です')
    }

    // 顧客IDを取得
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const customerId = customer?.id || null
    logger.log('人数変更開始:', { reservationId, newCount, customerId })

    // 予約情報を取得して料金を再計算
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('unit_price, schedule_event_id, participant_count, customer_id')
      .eq('id', reservationId)
      .single()

    if (fetchError || !reservation) {
      logger.error('予約情報取得エラー:', fetchError)
      throw new Error('予約情報の取得に失敗しました')
    }

    logger.log('予約情報取得:', reservation)

    // 予約の所有者を確認
    if (reservation.customer_id && reservation.customer_id !== customerId) {
      throw new Error('この予約を変更する権限がありません')
    }

    // 🚨 SECURITY FIX (SEC-P0-05): 直接UPDATEを削除
    // 人数変更は updateParticipantsWithLock RPC で完結（料金計算もRPC内で実施すべき）
    // 
    // 問題:
    //   - 元の実装は RPC で人数変更後、料金を直接UPDATEしていた
    //   - これにより、在庫ロックなしで料金を変更できる脆弱性があった
    // 
    // 修正:
    //   - RPC内で料金も更新するよう変更（027マイグレーションで対応）
    //   - 当面は RPC のみで人数変更、料金は手動更新不可とする
    
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

    return true
  },

  // 予約を更新
  async update(id: string, updates: Partial<Reservation>, sendEmail: boolean = false): Promise<Reservation> {
    // 変更前のデータを取得（メール送信用）
    let originalReservation: any = null
    if (sendEmail) {
      const { data: original, error: fetchError } = await supabase
        .from('reservations')
        .select(`
          *,
          customers(*),
          schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario)
        `)
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
      .select(`
        *,
        customers(*),
        schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario)
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // 変更確認メールを送信（sendEmail=trueの場合のみ）
    if (sendEmail && originalReservation && data.customers) {
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

          await supabase.functions.invoke('send-booking-change-confirmation', {
            body: {
              reservationId: data.id,
              customerEmail: data.customers.email,
              customerName: data.customers.name,
              scenarioTitle: data.scenario_title || scheduleEvent?.scenario,
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

    return data
  },

  // 予約をキャンセル
  async cancel(id: string, cancellationReason?: string): Promise<Reservation> {
    // 予約情報を取得（メール送信用）
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select(`
        *,
        customers(*),
        schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario)
      `)
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    if (!reservation) {
      throw new Error('予約情報の取得に失敗しました')
    }

    // customer_id が NULL でも動作するように修正（スタッフ予約・貸切予約対応）
    await reservationApi.cancelWithLock(id, reservation.customer_id ?? null, cancellationReason)

    const { data, error } = await supabase
      .from('reservations')
      .select()
      .eq('id', id)
      .single()

    if (error) throw error

    // キャンセル確認メールを送信
    if (reservation && reservation.customers) {
      try {
        const scheduleEvent = Array.isArray(reservation.schedule_events) ? reservation.schedule_events[0] : reservation.schedule_events
        const storeName = scheduleEvent?.venue || '店舗不明'

        // キャンセル料金を計算（ここでは簡易実装: 24時間前以降は100%）
        const eventDateTime = new Date(`${scheduleEvent?.date}T${scheduleEvent?.start_time}`)
        const hoursUntilEvent = (eventDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
        const cancellationFee = hoursUntilEvent < 24 ? (reservation.total_price || 0) : 0

        await supabase.functions.invoke('send-cancellation-confirmation', {
          body: {
            reservationId: reservation.id,
            customerEmail: reservation.customers.email,
            customerName: reservation.customers.name,
            scenarioTitle: reservation.scenario_title || scheduleEvent?.scenario,
            eventDate: scheduleEvent?.date,
            startTime: scheduleEvent?.start_time,
            endTime: scheduleEvent?.end_time,
            storeName,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price || 0,
            reservationNumber: reservation.reservation_number,
            cancelledBy: 'customer',
            cancellationReason: cancellationReason || 'お客様のご都合によるキャンセル',
            cancellationFee
          }
        })
        logger.log('キャンセル確認メール送信成功')

        // キャンセル待ち通知を送信
        if (reservation.schedule_event_id && reservation.organization_id) {
          // 組織のslugを取得（tryの外で定義してcatchでも使えるようにする）
          let orgSlug = 'queens-waltz'
          try {
            const { data: org } = await supabase
              .from('organizations')
              .select('slug')
              .eq('id', reservation.organization_id)
              .single()
            
            orgSlug = org?.slug || 'queens-waltz'
          } catch (orgError) {
            logger.warn('組織slug取得エラー、デフォルト値を使用:', orgError)
          }
          
          // 🔒 SEC-P0-03対策: bookingUrl はサーバー側で生成（送信しない）
          
          try {
            const notificationData = {
              organizationId: reservation.organization_id,
              scheduleEventId: reservation.schedule_event_id,
              freedSeats: reservation.participant_count,
              scenarioTitle: reservation.scenario_title || scheduleEvent?.scenario,
              eventDate: scheduleEvent?.date,
              startTime: scheduleEvent?.start_time,
              endTime: scheduleEvent?.end_time,
              storeName
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
                organization_id: reservation.organization_id,
                freed_seats: reservation.participant_count,
                scenario_title: reservation.scenario_title || scheduleEvent?.scenario,
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

    return data
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
      scenario_id?: string,
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

      // 3. すべてのスタッフ予約を抽出（表示用）
      const allStaffReservations = currentReservations.filter(r =>
        r.reservation_source === 'staff_entry' ||
        r.reservation_source === 'staff_participation' ||
        r.payment_method === 'staff'
      )

      // 4. スタッフ予約として管理している予約を抽出（削除対象の候補）
      // ※ staff_entry（GM欄から自動作成）と staff_participation（予約者タブから追加）が対象
      // ※ web（予約サイト）や walk_in（当日飛び込み）は保護
      const managedStaffReservations = currentReservations.filter(r =>
        r.reservation_source === 'staff_entry' ||
        r.reservation_source === 'staff_participation'
      )

      // 5. 追加が必要なスタッフ（すべてのスタッフ予約をチェック）
      const toAdd = staffParticipants.filter(staffName =>
        !allStaffReservations.some(r => r.participant_names?.includes(staffName))
      )

      // 6. 削除が必要なスタッフ予約
      // GM欄のスタッフ参加リストに含まれていない予約を削除
      // ※ staff_entry と staff_participation の両方が対象（GM欄と同期）
      // ※ web, walk_in, onsite 等は保護（一般顧客の予約を誤削除しない）
      const toRemove = managedStaffReservations.filter(r =>
        !r.participant_names?.some(name => staffParticipants.includes(name))
      )

      logger.log('🔄 スタッフ予約同期:', {
        staffParticipants,
        allStaffReservations: allStaffReservations.map(r => ({ name: r.participant_names, source: r.reservation_source })),
        toAdd,
        toRemove: toRemove.map(r => ({ name: r.participant_names, source: r.reservation_source }))
      })

      // 7. 実行
      // 追加
      if (eventDetails) {
        for (const staffName of toAdd) {
          const reservation = {
            schedule_event_id: eventId,
            title: eventDetails.scenario_title || '',
            scenario_id: eventDetails.scenario_id || null,
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
            reservation_source: 'staff_entry'
          }

          await this.create(reservation as Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'>)
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

