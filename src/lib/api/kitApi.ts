/**
 * キット管理API
 *
 * シナリオキットの配置管理と移動イベントを操作するAPI
 *
 * - キット位置 (scenario_kit_locations) はバックエンド API (/api/kit-locations) 経由で
 *   org_id をサーバー側で強制フィルタする
 * - キット移動イベント・完了状態 (kit_transfer_events / kit_transfer_completions) は
 *   引き続き Supabase 経由（別タスクで API 化予定）
 */

import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '../organization'
import { apiClient } from '@/lib/apiClient'
import type { KitLocation, KitTransferEvent, KitCondition, KitTransferCompletion } from '@/types'

/** API 応答の素の構造（org_scenario / scenario_master を scenario に変換するため） */
type KitLocationRaw = {
  org_scenario?: {
    id: string
    scenario_master_id: string
    scenario_masters?: { id?: string; title?: string | null } | null
  } | null
  scenario_master?: { id: string; title?: string | null } | null
  [key: string]: unknown
}

function transformKitLocation(item: KitLocationRaw): KitLocation {
  if (item.org_scenario) {
    return {
      ...item,
      scenario: {
        id: item.org_scenario.scenario_master_id,
        title: item.org_scenario.scenario_masters?.title || '',
        kit_count: 1,
      },
    } as unknown as KitLocation
  }
  if (item.scenario_master) {
    return {
      ...item,
      scenario: {
        id: item.scenario_master.id,
        title: item.scenario_master.title || '',
        kit_count: 1,
      },
    } as unknown as KitLocation
  }
  return { ...item, scenario: null } as unknown as KitLocation
}

export const kitApi = {
  // ============================================
  // キット位置関連（バックエンド API 経由）
  // ============================================

  /**
   * 全キット位置を取得
   */
  async getKitLocations(): Promise<KitLocation[]> {
    const data = await apiClient.get<KitLocationRaw[]>('/api/kit-locations')
    return data.map(transformKitLocation)
  },

  /**
   * 特定シナリオのキット位置を取得
   * scenarioId: organization_scenarios.id または scenarios.id（master id）
   */
  async getKitLocationsByScenario(scenarioId: string): Promise<KitLocation[]> {
    const data = await apiClient.get<KitLocationRaw[]>(
      `/api/kit-locations?scenario_id=${encodeURIComponent(scenarioId)}`
    )
    return (data || []).map(transformKitLocation)
  },

  /**
   * キット位置を設定（初期設定または更新）
   * scenarioId: organization_scenarios.id または scenario_master_id
   */
  async setKitLocation(
    scenarioId: string,
    kitNumber: number,
    storeId: string
  ): Promise<KitLocation> {
    const data = await apiClient.post<KitLocationRaw>('/api/kit-locations', {
      scenario_id: scenarioId,
      kit_number: kitNumber,
      store_id: storeId,
    })
    return transformKitLocation(data)
  },

  /**
   * キットの状態を更新
   * scenarioId: organization_scenarios.id または scenario_master_id
   */
  async updateKitCondition(
    scenarioId: string,
    kitNumber: number,
    condition: KitCondition,
    conditionNotes?: string | null
  ): Promise<KitLocation> {
    const data = await apiClient.patch<KitLocationRaw>('/api/kit-locations', {
      scenario_id: scenarioId,
      kit_number: kitNumber,
      condition,
      condition_notes: conditionNotes ?? null,
    })
    return transformKitLocation(data)
  },

  /**
   * シナリオの全キット位置を一括設定
   * scenarioId: organization_scenarios.id または scenario_master_id
   */
  async setAllKitLocations(
    scenarioId: string,
    storeIds: string[] // kit_number順に店舗IDを指定
  ): Promise<KitLocation[]> {
    const data = await apiClient.post<KitLocationRaw[]>(
      '/api/kit-locations?action=set_all',
      { scenario_id: scenarioId, store_ids: storeIds }
    )
    return (data || []).map(transformKitLocation)
  },

  // ============================================
  // キット移動イベント関連
  // TODO: バックエンド API 化（kit_transfer_events 用エンドポイント）
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
  // TODO: バックエンド API 化（kit_transfer_completions 用エンドポイント）
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

    // まず既存レコードを検索
    const { data: existing } = await supabase
      .from('kit_transfer_completions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('org_scenario_id', scenarioId)
      .eq('kit_number', kitNumber)
      .eq('performance_date', performanceDate)
      .eq('to_store_id', toStoreId)
      .maybeSingle()

    let data, error

    if (existing) {
      // 既存レコードがあれば更新
      const result = await supabase
        .from('kit_transfer_completions')
        .update({
          from_store_id: fromStoreId,
          picked_up_at: new Date().toISOString(),
          picked_up_by: staffId
        })
        .eq('id', existing.id)
        .select(`
          *,
          picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
          delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
        `)
        .single()
      data = result.data
      error = result.error
    } else {
      // org_scenario_id から scenario_master_id を取得
      let scenarioMasterId: string | null = null
      const { data: orgScenario } = await supabase
        .from('organization_scenarios')
        .select('scenario_master_id')
        .eq('id', scenarioId)
        .maybeSingle()
      if (orgScenario) {
        scenarioMasterId = orgScenario.scenario_master_id
      }

      // 新規レコードを挿入
      const result = await supabase
        .from('kit_transfer_completions')
        .insert({
          organization_id: orgId,
          org_scenario_id: scenarioId,
          scenario_master_id: scenarioMasterId,
          kit_number: kitNumber,
          performance_date: performanceDate,
          from_store_id: fromStoreId,
          to_store_id: toStoreId,
          picked_up_at: new Date().toISOString(),
          picked_up_by: staffId
        })
        .select(`
          *,
          picked_up_by_staff:staff!kit_transfer_completions_picked_up_by_fkey(id, name),
          delivered_by_staff:staff!kit_transfer_completions_delivered_by_fkey(id, name)
        `)
        .single()
      data = result.data
      error = result.error
    }

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

    // 2. キットの所在地を移動先店舗に更新（バックエンド API 経由）
    try {
      await apiClient.post('/api/kit-locations', {
        scenario_id: scenarioId,
        kit_number: kitNumber,
        store_id: toStoreId,
      })
    } catch (locationError) {
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
