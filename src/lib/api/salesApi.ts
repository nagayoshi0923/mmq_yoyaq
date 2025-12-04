/**
 * 売上分析関連API
 */
import { supabase } from '../supabase'
import { logger } from '@/utils/logger'

export const salesApi = {
  // 期間別売上データを取得
  async getSalesByPeriod(startDate: string, endDate: string) {
    // まずschedule_eventsを取得
    const { data: events, error } = await supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
      .order('date', { ascending: true })
    
    if (error) {
      throw error
    }
    
    if (!events || events.length === 0) {
      return []
    }
    
    // 全シナリオを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, author, duration, participation_fee, gm_test_participation_fee, participation_costs, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, scenario_type, gm_costs, production_costs, required_props')
    
    if (scenariosError) {
      // scenarios fetch error
    }
    
    // 全スタッフを取得（スタッフ参加の判定用）
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('name')
    
    if (staffError) {
      logger.error('スタッフデータの取得に失敗:', staffError)
    }
    
    const staffNames = new Set(staff?.map(s => s.name) || [])
    
    // シナリオ名でマッピング（scenario_idがない場合のフォールバック）
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })
    
    // 各イベントの実際の予約データを取得して売上を計算
    const enrichedEvents = await Promise.all(events.map(async (event) => {
      let scenarioInfo = null
      
      // scenario_idがあればそれを使用、なければscenario（TEXT）からマッチング
      if (event.scenario_id && scenarios) {
        scenarioInfo = scenarios.find(s => s.id === event.scenario_id)
      } else if (event.scenario) {
        scenarioInfo = scenarioMap.get(event.scenario)
      }
      
      // このイベントの予約データを取得
      const { data: reservations, error: reservationError } = await supabase
        .from('reservations')
        .select('participant_count, participant_names, payment_method, final_price')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      
      if (reservationError) {
        logger.error('予約データの取得に失敗:', reservationError)
      }
      
      // 実際の参加者数と売上を計算
      let totalParticipants = 0
      let totalRevenue = 0
      
      reservations?.forEach(reservation => {
        const participantCount = reservation.participant_count || 0
        totalParticipants += participantCount
        
        // 参加者名をチェックしてスタッフかどうか判定
        const participantNames = reservation.participant_names || []
        const hasStaffParticipant = participantNames.some(name => staffNames.has(name))
        
        if (hasStaffParticipant || reservation.payment_method === 'staff') {
          // スタッフ参加の場合は参加費0円
          totalRevenue += 0
        } else {
          // 通常参加の場合は実際の支払い金額を使用
          totalRevenue += reservation.final_price || 0
        }
      })
      
      return {
        ...event,
        scenarios: scenarioInfo,
        revenue: totalRevenue,
        actual_participants: totalParticipants,
        has_demo_participant: totalParticipants >= (event.max_participants || event.capacity || 0)
      }
    }))
    
    return enrichedEvents
  },

  // 店舗別売上データを取得
  async getSalesByStore(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenarios:scenario_id (
          id,
          title,
          author,
          duration,
          participation_fee,
          gm_test_participation_fee,
          participation_costs,
          license_amount,
          gm_test_license_amount,
          gm_costs
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // シナリオ別売上データを取得
  async getSalesByScenario(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenarios:scenario_id (
          id,
          title,
          author,
          duration,
          participation_fee,
          gm_test_participation_fee,
          participation_costs,
          license_amount,
          gm_test_license_amount,
          gm_costs
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // 作者別公演実行回数を取得
  async getPerformanceCountByAuthor(startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('schedule_events')
      .select(`
        date,
        scenarios:scenario_id (
          id,
          title,
          author
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (error) throw error
    return data || []
  },

  // 店舗一覧を取得
  async getStores() {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, short_name, fixed_costs, ownership_type')
      .order('name', { ascending: true })
    
    if (error) throw error
    return data || []
  },

  // シナリオ別公演数データ取得
  async getScenarioPerformance(startDate: string, endDate: string, storeId?: string) {
    let query = supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)

    if (storeId && storeId !== 'all') {
      query = query.eq('store_id', storeId)
    }

    const { data: events, error } = await query

    if (error) throw error

    if (!events || events.length === 0) {
      return []
    }

    // 全シナリオを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, author, license_amount, gm_test_license_amount, gm_costs')
    
    if (scenariosError) {
      logger.error('scenarios取得エラー:', scenariosError)
    }

    // シナリオ名でマッピング
    const scenarioMap = new Map()
    scenarios?.forEach(s => {
      scenarioMap.set(s.title, s)
    })

    // シナリオ別に集計（GMテストのみ分離、それ以外は統合）
    const performanceMap = new Map()
    
    events.forEach(event => {
      let scenarioInfo = null
      if (event.scenario_id && scenarios) {
        scenarioInfo = scenarios.find(s => s.id === event.scenario_id)
      } else if (event.scenario) {
        scenarioInfo = scenarioMap.get(event.scenario)
      }

      if (!scenarioInfo && event.scenario) {
        scenarioInfo = {
          id: event.scenario,
          title: event.scenario,
          author: '不明'
        }
      }

      if (scenarioInfo) {
        const category = event.category || 'open'
        const isGMTest = category === 'gmtest'
        const key = isGMTest ? `${scenarioInfo.id}_gmtest` : scenarioInfo.id
        
        if (performanceMap.has(key)) {
          const existing = performanceMap.get(key)
          existing.events += 1
          if (event.venue) {
            existing.stores.add(event.venue)
          }
        } else {
          performanceMap.set(key, {
            id: scenarioInfo.id,
            title: scenarioInfo.title,
            author: scenarioInfo.author,
            category: isGMTest ? 'gmtest' : 'open',
            events: 1,
            stores: new Set(event.venue ? [event.venue] : [])
          })
        }
      }
    })

    const result = Array.from(performanceMap.values()).map(item => ({
      ...item,
      stores: Array.from(item.stores)
    }))

    return result
  }
}

