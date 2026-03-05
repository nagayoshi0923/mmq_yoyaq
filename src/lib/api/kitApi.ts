/**
 * キット管理API
 * 
 * シナリオキットの配置管理と移動イベントを操作するAPI
 */

import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '../organization'
import type { KitLocation, KitTransferEvent, KitCondition, KitTransferCompletion } from '@/types'

export const kitApi = {
  // ============================================
  // キット位置関連
  // ============================================

  /**
   * 全キット位置を取得
   */
  async getKitLocations(): Promise<KitLocation[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return []

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .select(`
        *,
        org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        legacy_scenario:scenarios!scenario_kit_locations_scenario_id_fkey(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .order('org_scenario_id', { nullsFirst: false })
      .order('scenario_id', { nullsFirst: false })
      .order('kit_number')

    if (error) {
      console.error('Failed to fetch kit locations:', error)
      throw error
    }

    // org_scenario または legacy_scenario から scenario 形式に変換
    const transformed = (data || []).map(item => {
      if (item.org_scenario) {
        return {
          ...item,
          scenario: {
            id: item.org_scenario.id,
            title: item.org_scenario.scenario_masters?.title || '',
            kit_count: 1
          }
        }
      } else if (item.legacy_scenario) {
        return {
          ...item,
          scenario: {
            id: item.legacy_scenario.id,
            title: item.legacy_scenario.title || '',
            kit_count: item.legacy_scenario.kit_count || 1
          }
        }
      }
      return { ...item, scenario: null }
    })

    return transformed as KitLocation[]
  },

  /**
   * 特定シナリオのキット位置を取得
   * scenarioId: organization_scenarios.id または scenarios.id
   */
  async getKitLocationsByScenario(scenarioId: string): Promise<KitLocation[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return []

    // まず org_scenario_id で検索
    let { data, error } = await supabase
      .from('scenario_kit_locations')
      .select(`
        *,
        org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        legacy_scenario:scenarios!scenario_kit_locations_scenario_id_fkey(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .order('kit_number')

    // 結果がなければ legacy scenario_id で検索
    if (!data || data.length === 0) {
      const legacyResult = await supabase
        .from('scenario_kit_locations')
        .select(`
          *,
          org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
            id,
            scenario_master_id,
            scenario_masters(id, title)
          ),
          legacy_scenario:scenarios!scenario_kit_locations_scenario_id_fkey(id, title, kit_count),
          store:stores(id, name, short_name)
        `)
        .eq('organization_id', orgId)
        .eq('scenario_id', scenarioId)
        .order('kit_number')
      
      data = legacyResult.data
      error = legacyResult.error
    }

    if (error) {
      console.error('Failed to fetch kit locations by scenario:', error)
      throw error
    }

    const transformed = (data || []).map(item => {
      if (item.org_scenario) {
        return {
          ...item,
          scenario: {
            id: item.org_scenario.id,
            title: item.org_scenario.scenario_masters?.title || '',
            kit_count: 1
          }
        }
      } else if (item.legacy_scenario) {
        return {
          ...item,
          scenario: {
            id: item.legacy_scenario.id,
            title: item.legacy_scenario.title || '',
            kit_count: item.legacy_scenario.kit_count || 1
          }
        }
      }
      return { ...item, scenario: null }
    })

    return transformed as KitLocation[]
  },

  /**
   * キット位置を設定（初期設定または更新）
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async setKitLocation(
    scenarioId: string,
    kitNumber: number,
    storeId: string
  ): Promise<KitLocation> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .upsert({
        organization_id: orgId,
        org_scenario_id: scenarioId,
        kit_number: kitNumber,
        store_id: storeId
      }, {
        onConflict: 'organization_id,org_scenario_id,kit_number'
      })
      .select(`
        *,
        org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        store:stores(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to set kit location:', error)
      throw error
    }

    const transformed = {
      ...data,
      scenario: data.org_scenario ? {
        id: data.org_scenario.id,
        title: data.org_scenario.scenario_masters?.title || '',
        kit_count: 1
      } : null
    }

    return transformed as KitLocation
  },

  /**
   * キットの状態を更新
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async updateKitCondition(
    scenarioId: string,
    kitNumber: number,
    condition: KitCondition,
    conditionNotes?: string | null
  ): Promise<KitLocation> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .update({
        condition,
        condition_notes: conditionNotes
      })
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .select(`
        *,
        org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        store:stores(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to update kit condition:', error)
      throw error
    }

    const transformed = {
      ...data,
      scenario: data.org_scenario ? {
        id: data.org_scenario.id,
        title: data.org_scenario.scenario_masters?.title || '',
        kit_count: 1
      } : null
    }

    return transformed as KitLocation
  },

  /**
   * シナリオの全キット位置を一括設定
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async setAllKitLocations(
    scenarioId: string,
    storeIds: string[]  // kit_number順に店舗IDを指定
  ): Promise<KitLocation[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const records = storeIds.map((storeId, index) => ({
      organization_id: orgId,
      org_scenario_id: scenarioId,
      kit_number: index + 1,
      store_id: storeId
    }))

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .upsert(records, {
        onConflict: 'organization_id,org_scenario_id,kit_number'
      })
      .select(`
        *,
        org_scenario:organization_scenarios!scenario_kit_locations_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        store:stores(id, name, short_name)
      `)

    if (error) {
      console.error('Failed to set all kit locations:', error)
      throw error
    }

    const transformed = (data || []).map(item => ({
      ...item,
      scenario: item.org_scenario ? {
        id: item.org_scenario.id,
        title: item.org_scenario.scenario_masters?.title || '',
        kit_count: 1
      } : null
    }))

    return transformed as KitLocation[]
  },

  // ============================================
  // キット移動イベント関連
  // ============================================

  /**
   * 移動イベント一覧を取得（期間指定）
   */
  async getTransferEvents(
    startDate: string,
    endDate: string
  ): Promise<KitTransferEvent[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return []

    const { data, error } = await supabase
      .from('kit_transfer_events')
      .select(`
        *,
        org_scenario:organization_scenarios!kit_transfer_events_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .gte('transfer_date', startDate)
      .lte('transfer_date', endDate)
      .order('transfer_date')
      .order('org_scenario_id')

    if (error) {
      console.error('Failed to fetch transfer events:', error)
      throw error
    }

    const transformed = (data || []).map(item => ({
      ...item,
      scenario: item.org_scenario ? {
        id: item.org_scenario.id,
        title: item.org_scenario.scenario_masters?.title || ''
      } : null
    }))

    return transformed as KitTransferEvent[]
  },

  /**
   * 移動イベントを作成
   * event.org_scenario_id: organization_scenarios.id
   */
  async createTransferEvent(
    event: Omit<KitTransferEvent, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'scenario' | 'from_store' | 'to_store'>
  ): Promise<KitTransferEvent> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { data: userData } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('kit_transfer_events')
      .insert({
        ...event,
        organization_id: orgId,
        created_by: userData?.user?.id
      })
      .select(`
        *,
        org_scenario:organization_scenarios!kit_transfer_events_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to create transfer event:', error)
      throw error
    }

    const transformed = {
      ...data,
      scenario: data.org_scenario ? {
        id: data.org_scenario.id,
        title: data.org_scenario.scenario_masters?.title || ''
      } : null
    }

    return transformed as KitTransferEvent
  },

  /**
   * 移動イベントを一括作成
   * events[].org_scenario_id: organization_scenarios.id
   */
  async createTransferEvents(
    events: Array<Omit<KitTransferEvent, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'scenario' | 'from_store' | 'to_store'>>
  ): Promise<KitTransferEvent[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { data: userData } = await supabase.auth.getUser()

    const records = events.map(event => ({
      ...event,
      organization_id: orgId,
      created_by: userData?.user?.id
    }))

    const { data, error } = await supabase
      .from('kit_transfer_events')
      .insert(records)
      .select(`
        *,
        org_scenario:organization_scenarios!kit_transfer_events_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)

    if (error) {
      console.error('Failed to create transfer events:', error)
      throw error
    }

    const transformed = (data || []).map(item => ({
      ...item,
      scenario: item.org_scenario ? {
        id: item.org_scenario.id,
        title: item.org_scenario.scenario_masters?.title || ''
      } : null
    }))

    return transformed as KitTransferEvent[]
  },

  /**
   * 移動イベントのステータスを更新
   */
  async updateTransferStatus(
    eventId: string,
    status: 'pending' | 'completed' | 'cancelled'
  ): Promise<KitTransferEvent> {
    const { data, error } = await supabase
      .from('kit_transfer_events')
      .update({ status })
      .eq('id', eventId)
      .select(`
        *,
        org_scenario:organization_scenarios!kit_transfer_events_org_scenario_id_fkey(
          id,
          scenario_master_id,
          scenario_masters(id, title)
        ),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to update transfer status:', error)
      throw error
    }

    const transformed = {
      ...data,
      scenario: data.org_scenario ? {
        id: data.org_scenario.id,
        title: data.org_scenario.scenario_masters?.title || ''
      } : null
    }

    return transformed as KitTransferEvent
  },

  /**
   * 移動イベントを削除
   */
  async deleteTransferEvent(eventId: string): Promise<void> {
    const { error } = await supabase
      .from('kit_transfer_events')
      .delete()
      .eq('id', eventId)

    if (error) {
      console.error('Failed to delete transfer event:', error)
      throw error
    }
  },

  /**
   * 期間内のpending移動イベントをすべてキャンセル
   */
  async cancelPendingTransfers(
    startDate: string,
    endDate: string
  ): Promise<number> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return 0

    const { data, error } = await supabase
      .from('kit_transfer_events')
      .update({ status: 'cancelled' })
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .gte('transfer_date', startDate)
      .lte('transfer_date', endDate)
      .select('id')

    if (error) {
      console.error('Failed to cancel pending transfers:', error)
      throw error
    }

    return data?.length || 0
  },

  // ============================================
  // キット移動完了状態関連
  // ============================================

  /**
   * 期間内の移動完了状態を取得
   */
  async getTransferCompletions(
    startDate: string,
    endDate: string
  ): Promise<KitTransferCompletion[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return []

    const { data, error } = await supabase
      .from('kit_transfer_completions')
      .select(`
        *,
        picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
        delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
      `)
      .eq('organization_id', orgId)
      .gte('performance_date', startDate)
      .lte('performance_date', endDate)

    if (error) {
      console.error('Failed to fetch transfer completions:', error)
      throw error
    }

    return data || []
  },

  /**
   * 回収完了をマーク
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async markPickedUp(
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    fromStoreId: string,
    toStoreId: string,
    staffId: string
  ): Promise<KitTransferCompletion> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { data, error } = await supabase
      .from('kit_transfer_completions')
      .upsert({
        organization_id: orgId,
        org_scenario_id: scenarioId,
        kit_number: kitNumber,
        performance_date: performanceDate,
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        picked_up_at: new Date().toISOString(),
        picked_up_by: staffId
      }, {
        onConflict: 'organization_id,org_scenario_id,kit_number,performance_date,to_store_id'
      })
      .select(`
        *,
        picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
        delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
      `)
      .single()

    if (error) {
      console.error('Failed to mark picked up:', error)
      throw error
    }

    return data
  },

  /**
   * 回収完了を解除
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async unmarkPickedUp(
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { error } = await supabase
      .from('kit_transfer_completions')
      .update({
        picked_up_at: null,
        picked_up_by: null,
        delivered_at: null,
        delivered_by: null
      })
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .eq('performance_date', performanceDate)
      .eq('to_store_id', toStoreId)

    if (error) {
      console.error('Failed to unmark picked up:', error)
      throw error
    }
  },

  /**
   * 設置完了をマーク
   * キットの所在地も移動先店舗に更新する
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async markDelivered(
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string,
    staffId: string
  ): Promise<KitTransferCompletion> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    // 1. 完了状態を更新
    const { data, error } = await supabase
      .from('kit_transfer_completions')
      .update({
        delivered_at: new Date().toISOString(),
        delivered_by: staffId
      })
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .eq('performance_date', performanceDate)
      .eq('to_store_id', toStoreId)
      .select(`
        *,
        picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
        delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
      `)
      .single()

    if (error) {
      console.error('Failed to mark delivered:', error)
      throw error
    }

    // 2. キットの所在地を移動先店舗に更新
    const { error: locationError } = await supabase
      .from('scenario_kit_locations')
      .update({
        store_id: toStoreId,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)

    if (locationError) {
      console.error('Failed to update kit location:', locationError)
      // 完了状態の更新は成功しているので、ログだけ出してエラーはスローしない
    }

    return data
  },

  /**
   * 設置完了を解除
   * scenarioId: organization_scenarios.id（org_scenario_id）
   */
  async unmarkDelivered(
    scenarioId: string,
    kitNumber: number,
    performanceDate: string,
    toStoreId: string
  ): Promise<void> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const { error } = await supabase
      .from('kit_transfer_completions')
      .update({
        delivered_at: null,
        delivered_by: null
      })
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .eq('performance_date', performanceDate)
      .eq('to_store_id', toStoreId)

    if (error) {
      console.error('Failed to unmark delivered:', error)
      throw error
    }
  },

  /**
   * 全完了状態をクリア（期間指定）
   */
  async clearAllCompletions(
    startDate: string,
    endDate: string
  ): Promise<number> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return 0

    const { data, error } = await supabase
      .from('kit_transfer_completions')
      .delete()
      .eq('organization_id', orgId)
      .gte('performance_date', startDate)
      .lte('performance_date', endDate)
      .select('id')

    if (error) {
      console.error('Failed to clear completions:', error)
      throw error
    }

    return data?.length || 0
  }
}
