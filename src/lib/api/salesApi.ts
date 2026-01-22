/**
 * 売上分析関連API
 */
import { supabase } from '../supabase'
import { logger } from '@/utils/logger'
import { getCurrentOrganizationId } from '@/lib/organization'

export const salesApi = {
  // 期間別売上データを取得
  // organizationId: 指定した場合そのIDを使用、未指定の場合はログインユーザーの組織で自動フィルタ
  async getSalesByPeriod(startDate: string, endDate: string, organizationId?: string) {
    // 組織フィルタリング
    const orgId = organizationId || await getCurrentOrganizationId()
    
    // まずschedule_eventsを取得
    let query = supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data: events, error } = await query.order('date', { ascending: true })
    
    if (error) {
      throw error
    }
    
    if (!events || events.length === 0) {
      return []
    }
    
    // シナリオを取得（組織フィルタ適用）
    let scenarioQuery = supabase
      .from('scenarios')
      .select('id, title, author, duration, participation_fee, gm_test_participation_fee, participation_costs, license_amount, gm_test_license_amount, franchise_license_amount, franchise_gm_test_license_amount, scenario_type, gm_costs, production_costs, required_props')
    
    if (orgId) {
      scenarioQuery = scenarioQuery.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data: scenarios, error: scenariosError } = await scenarioQuery
    
    if (scenariosError) {
      logger.error('シナリオデータの取得に失敗:', scenariosError)
    }
    
    // スタッフを取得（組織フィルタ適用）
    let staffQuery = supabase
      .from('staff')
      .select('name')
    
    if (orgId) {
      staffQuery = staffQuery.eq('organization_id', orgId)
    }
    
    const { data: staff, error: staffError } = await staffQuery
    
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
      
      // このイベントの予約データを取得（組織フィルタ付き）
      let resQuery = supabase
        .from('reservations')
        .select('participant_count, participant_names, payment_method, final_price')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      
      if (orgId) {
        resQuery = resQuery.eq('organization_id', orgId)
      }
      
      const { data: reservations, error: reservationError } = await resQuery
      
      if (reservationError) {
        logger.error('予約データの取得に失敗:', reservationError)
      }
      
      // 実際の参加者数と売上を計算
      let totalParticipants = 0
      let totalRevenue = 0
      
      // 場所貸しの場合は venue_rental_fee を使用
      const isVenueRental = event.category === 'venue_rental' || event.category === 'venue_rental_free'
      if (isVenueRental) {
        // 場所貸し無料は0円、場所貸しは設定された料金（デフォルト12,000円）
        totalRevenue = event.category === 'venue_rental_free' ? 0 : (event.venue_rental_fee || 12000)
      } else {
        reservations?.forEach(reservation => {
          const participantCount = reservation.participant_count || 0
          totalParticipants += participantCount
          
          // 参加者名をチェックしてスタッフかどうか判定
          const participantNames = reservation.participant_names || []
          const hasStaffParticipant = participantNames.some((name: string) => staffNames.has(name))
          
          if (hasStaffParticipant || reservation.payment_method === 'staff') {
            // スタッフ参加の場合は参加費0円
            totalRevenue += 0
          } else {
            // 通常参加の場合は実際の支払い金額を使用
            totalRevenue += reservation.final_price || 0
          }
        })
      }
      
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
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
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
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // シナリオ別売上データを取得
  async getSalesByScenario(startDate: string, endDate: string) {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
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
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // 作者別公演実行回数を取得
  async getPerformanceCountByAuthor(startDate: string, endDate: string) {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
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
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // 店舗一覧を取得
  async getStores() {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('stores')
      .select('id, name, short_name, fixed_costs, ownership_type')
      .order('name', { ascending: true })
    
    if (orgId) {
      query = query.eq('organization_id', orgId)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  },

  // シナリオ別公演数データ取得
  async getScenarioPerformance(startDate: string, endDate: string, storeIds?: string[]) {
    const orgId = await getCurrentOrganizationId()
    
    let query = supabase
      .from('schedule_events')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_cancelled', false)

    if (orgId) {
      query = query.eq('organization_id', orgId)
    }

    if (storeIds && storeIds.length > 0) {
      query = query.in('store_id', storeIds)
    }

    const { data: events, error } = await query

    if (error) throw error

    if (!events || events.length === 0) {
      return []
    }

    // 全シナリオを取得（組織フィルタ）
    let scenarioQuery = supabase
      .from('scenarios')
      .select('id, title, author, license_amount, gm_test_license_amount, gm_costs')
    
    if (orgId) {
      scenarioQuery = scenarioQuery.or(`organization_id.eq.${orgId},is_shared.eq.true`)
    }
    
    const { data: scenarios, error: scenariosError } = await scenarioQuery
    
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

