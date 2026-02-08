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
        scenario:scenarios(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .order('scenario_id')
      .order('kit_number')

    if (error) {
      console.error('Failed to fetch kit locations:', error)
      throw error
    }

    return data || []
  },

  /**
   * 特定シナリオのキット位置を取得
   */
  async getKitLocationsByScenario(scenarioId: string): Promise<KitLocation[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) return []

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .select(`
        *,
        scenario:scenarios(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .eq('scenario_id', scenarioId)
      .order('kit_number')

    if (error) {
      console.error('Failed to fetch kit locations by scenario:', error)
      throw error
    }

    return data || []
  },

  /**
   * キット位置を設定（初期設定または更新）
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
        scenario_id: scenarioId,
        kit_number: kitNumber,
        store_id: storeId
      }, {
        onConflict: 'organization_id,scenario_id,kit_number'
      })
      .select(`
        *,
        scenario:scenarios(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to set kit location:', error)
      throw error
    }

    return data
  },

  /**
   * キットの状態を更新
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
      .eq('scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .select(`
        *,
        scenario:scenarios(id, title, kit_count),
        store:stores(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to update kit condition:', error)
      throw error
    }

    return data
  },

  /**
   * シナリオの全キット位置を一括設定
   */
  async setAllKitLocations(
    scenarioId: string,
    storeIds: string[]  // kit_number順に店舗IDを指定
  ): Promise<KitLocation[]> {
    const orgId = await getCurrentOrganizationId()
    if (!orgId) throw new Error('Organization ID not found')

    const records = storeIds.map((storeId, index) => ({
      organization_id: orgId,
      scenario_id: scenarioId,
      kit_number: index + 1,
      store_id: storeId
    }))

    const { data, error } = await supabase
      .from('scenario_kit_locations')
      .upsert(records, {
        onConflict: 'organization_id,scenario_id,kit_number'
      })
      .select(`
        *,
        scenario:scenarios(id, title, kit_count),
        store:stores(id, name, short_name)
      `)

    if (error) {
      console.error('Failed to set all kit locations:', error)
      throw error
    }

    return data || []
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
        scenario:scenarios(id, title),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .eq('organization_id', orgId)
      .gte('transfer_date', startDate)
      .lte('transfer_date', endDate)
      .order('transfer_date')
      .order('scenario_id')

    if (error) {
      console.error('Failed to fetch transfer events:', error)
      throw error
    }

    return data || []
  },

  /**
   * 移動イベントを作成
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
        scenario:scenarios(id, title),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to create transfer event:', error)
      throw error
    }

    return data
  },

  /**
   * 移動イベントを一括作成
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
        scenario:scenarios(id, title),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)

    if (error) {
      console.error('Failed to create transfer events:', error)
      throw error
    }

    return data || []
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
        scenario:scenarios(id, title),
        from_store:stores!kit_transfer_events_from_store_id_fkey(id, name, short_name),
        to_store:stores!kit_transfer_events_to_store_id_fkey(id, name, short_name)
      `)
      .single()

    if (error) {
      console.error('Failed to update transfer status:', error)
      throw error
    }

    return data
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
    console.log('[kitApi] getTransferCompletions called:', { startDate, endDate, orgId })
    if (!orgId) {
      console.warn('[kitApi] No organization ID found')
      return []
    }

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

    console.log('[kitApi] getTransferCompletions result:', { count: data?.length, error })
    if (error) {
      console.error('Failed to fetch transfer completions:', error)
      throw error
    }

    return data || []
  },

  /**
   * 回収完了をマーク
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
        scenario_id: scenarioId,
        kit_number: kitNumber,
        performance_date: performanceDate,
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        picked_up_at: new Date().toISOString(),
        picked_up_by: staffId
      }, {
        onConflict: 'organization_id,scenario_id,kit_number,performance_date,to_store_id'
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
      .eq('scenario_id', scenarioId)
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
      .eq('scenario_id', scenarioId)
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
      .eq('scenario_id', scenarioId)
      .eq('kit_number', kitNumber)

    if (locationError) {
      console.error('Failed to update kit location:', locationError)
      // 完了状態の更新は成功しているので、ログだけ出してエラーはスローしない
    }

    return data
  },

  /**
   * 設置完了を解除
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
      .eq('scenario_id', scenarioId)
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
