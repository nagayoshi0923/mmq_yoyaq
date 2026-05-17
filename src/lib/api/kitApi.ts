/**
 * キット管理API
 *
 * シナリオキットの配置管理と移動イベントを操作するAPI
 *
 * すべてバックエンド API (/api/kit-locations, /api/kit-transfer-events,
 * /api/kit-transfer-completions) 経由で org_id をサーバー側で強制フィルタする
 */

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

/** transfer_events / transfer_completions の生レスポンス（scenario 整形用） */
type TransferEventRaw = {
  org_scenario?: {
    id: string
    scenario_master_id?: string
    scenario_masters?: { id?: string; title?: string | null } | null
  } | null
  [key: string]: unknown
}

function transformTransferEvent(item: TransferEventRaw): KitTransferEvent {
  return {
    ...item,
    scenario: item.org_scenario
      ? {
          id: item.org_scenario.id,
          title: item.org_scenario.scenario_masters?.title || '',
        }
      : null,
  } as unknown as KitTransferEvent
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
  // キット移動イベント関連（バックエンド API 経由）
  // ============================================

  /**
   * 移動イベント一覧を取得（期間指定）
   */
  async getTransferEvents(
    startDate: string,
    endDate: string
  ): Promise<KitTransferEvent[]> {
    const data = await apiClient.get<TransferEventRaw[]>(
      `/api/kit-transfer-events?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
    )
    return (data || []).map(transformTransferEvent)
  },

  /**
   * 移動イベントを作成
   * event.org_scenario_id: organization_scenarios.id
   */
  async createTransferEvent(
    event: Omit<KitTransferEvent, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'scenario' | 'from_store' | 'to_store'>
  ): Promise<KitTransferEvent> {
    const data = await apiClient.post<TransferEventRaw>('/api/kit-transfer-events', event)
    return transformTransferEvent(data)
  },

  /**
   * 移動イベントを一括作成
   * events[].org_scenario_id: organization_scenarios.id
   */
  async createTransferEvents(
    events: Array<Omit<KitTransferEvent, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'scenario' | 'from_store' | 'to_store'>>
  ): Promise<KitTransferEvent[]> {
    const data = await apiClient.post<TransferEventRaw[]>('/api/kit-transfer-events', { events })
    return (data || []).map(transformTransferEvent)
  },

  /**
   * 移動イベントのステータスを更新
   */
  async updateTransferStatus(
    eventId: string,
    status: 'pending' | 'completed' | 'cancelled'
  ): Promise<KitTransferEvent> {
    const data = await apiClient.patch<TransferEventRaw>(
      `/api/kit-transfer-events?id=${encodeURIComponent(eventId)}`,
      { status }
    )
    return transformTransferEvent(data)
  },

  /**
   * 移動イベントを削除
   */
  async deleteTransferEvent(eventId: string): Promise<void> {
    await apiClient.delete(`/api/kit-transfer-events?id=${encodeURIComponent(eventId)}`)
  },

  /**
   * 期間内のpending移動イベントをすべてキャンセル
   */
  async cancelPendingTransfers(
    startDate: string,
    endDate: string
  ): Promise<number> {
    const result = await apiClient.post<{ cancelled: number }>(
      '/api/kit-transfer-events?action=cancel_pending',
      { start_date: startDate, end_date: endDate }
    )
    return result.cancelled ?? 0
  },

  // ============================================
  // キット移動完了状態関連（バックエンド API 経由）
  // ============================================

  /**
   * 期間内の移動完了状態を取得
   */
  async getTransferCompletions(
    startDate: string,
    endDate: string
  ): Promise<KitTransferCompletion[]> {
    const data = await apiClient.get<KitTransferCompletion[]>(
      `/api/kit-transfer-completions?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
    )
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
    return apiClient.post<KitTransferCompletion>(
      '/api/kit-transfer-completions?action=mark_picked_up',
      {
        scenario_id: scenarioId,
        kit_number: kitNumber,
        performance_date: performanceDate,
        from_store_id: fromStoreId,
        to_store_id: toStoreId,
        staff_id: staffId,
      }
    )
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
    await apiClient.post('/api/kit-transfer-completions?action=unmark_picked_up', {
      scenario_id: scenarioId,
      kit_number: kitNumber,
      performance_date: performanceDate,
      to_store_id: toStoreId,
    })
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
    const data = await apiClient.post<KitTransferCompletion>(
      '/api/kit-transfer-completions?action=mark_delivered',
      {
        scenario_id: scenarioId,
        kit_number: kitNumber,
        performance_date: performanceDate,
        to_store_id: toStoreId,
        staff_id: staffId,
      }
    )

    // キットの所在地を移動先店舗に更新（バックエンド API 経由）
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
    await apiClient.post('/api/kit-transfer-completions?action=unmark_delivered', {
      scenario_id: scenarioId,
      kit_number: kitNumber,
      performance_date: performanceDate,
      to_store_id: toStoreId,
    })
  },

  /**
   * 全完了状態をクリア（期間指定）
   */
  async clearAllCompletions(
    startDate: string,
    endDate: string
  ): Promise<number> {
    const result = await apiClient.delete<{ cleared: number }>(
      `/api/kit-transfer-completions?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`
    )
    return result.cleared ?? 0
  }
}
