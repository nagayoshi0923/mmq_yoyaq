import { supabase } from './supabase'
import type { Reservation, Customer, ReservationSummary } from '@/types'

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
      .select('*')
      .eq('schedule_event_id', scheduleEventId)
      .in('status', ['pending', 'confirmed'])
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
    // 予約番号を自動生成（YYYYMMDD-XXXX形式）
    const date = new Date()
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
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
  async update(id: string, updates: Partial<Reservation>): Promise<Reservation> {
    const { data, error } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // 予約をキャンセル
  async cancel(id: string, cancellationReason?: string): Promise<Reservation> {
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
  }
}

