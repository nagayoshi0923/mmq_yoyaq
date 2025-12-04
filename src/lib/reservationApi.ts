import { supabase } from './supabase'
import { logger } from '@/utils/logger'
import type { Reservation, Customer, ReservationSummary } from '@/types'
import { logger } from '@/utils/logger'

// 顧客関連のAPI
export const customerApi = {
  // 全顧客を取得
  async getAll(): Promise<Customer[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 顧客を作成
  async create(customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'visit_count' | 'total_spent'>): Promise<Customer> {
    const { data, error } = await supabase
      .from('customers')
      .insert([customer])
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
      .select('*')
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
      .select('*')
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
  async getAll(): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('requested_datetime', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 特定期間の予約を取得
  async getByDateRange(startDate: string, endDate: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .gte('requested_datetime', startDate)
      .lte('requested_datetime', endDate)
      .order('requested_datetime', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // スケジュールイベントIDで予約を取得
  async getByScheduleEvent(scheduleEventId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*, customers(*)')
      .eq('schedule_event_id', scheduleEventId)
      .in('status', ['pending', 'confirmed', 'gm_confirmed'])
      .order('created_at', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // 顧客IDで予約を取得
  async getByCustomer(customerId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('customer_id', customerId)
      .order('requested_datetime', { ascending: false })
    
    if (error) throw error
    return data || []
  },

  // 予約を作成
  async create(reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'reservation_number'>): Promise<Reservation> {
    // 予約番号を自動生成（YYMMDD-XXXX形式: 11桁）
    const now = new Date()
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
    const reservationNumber = `${dateStr}-${randomStr}`

    const { data, error } = await supabase
      .from('reservations')
      .insert([{ ...reservation, reservation_number: reservationNumber }])
      .select()
      .single()
    
    if (error) throw error
    return data
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

    const { data, error } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        customers(*),
        schedule_events!schedule_event_id(date, start_time, end_time, venue, scenario)
      `)
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

    const { data, error } = await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancellationReason
      })
      .eq('id', id)
      .select()
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
      } catch (emailError) {
        logger.error('キャンセル確認メール送信エラー:', emailError)
        // メール送信失敗してもキャンセル処理は続行
      }
    }

    return data
  },

  // 予約を削除
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // 予約サマリーを取得
  async getSummary(scheduleEventId?: string): Promise<ReservationSummary[]> {
    let query = supabase
      .from('reservation_summary')
      .select('*')
    
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
      .select('*')
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

      // 3. スタッフ予約のみ抽出
      const currentStaffReservations = currentReservations.filter(r =>
        r.reservation_source === 'staff_entry' ||
        r.payment_method === 'staff' ||
        (r.participant_names && r.participant_names.some(name => staffParticipants.includes(name)))
      )

      // 4. 追加が必要なスタッフ
      const toAdd = staffParticipants.filter(staffName =>
        !currentStaffReservations.some(r => r.participant_names?.includes(staffName))
      )

      // 5. 削除が必要なスタッフ予約（スタッフリストに含まれていない予約）
      const toRemove = currentStaffReservations.filter(r =>
        !r.participant_names?.some(name => staffParticipants.includes(name))
      )

      // 6. 実行
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

      // 削除（キャンセル）
      for (const res of toRemove) {
        if (res.status !== 'cancelled') {
          await this.update(res.id, { status: 'cancelled' })
        }
      }
    } catch (error) {
      logger.error('スタッフ予約同期エラー:', error)
    }
  }
}

