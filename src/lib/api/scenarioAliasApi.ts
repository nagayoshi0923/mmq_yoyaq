import { apiClient } from '@/lib/apiClient'
import { logger } from '@/utils/logger'

/**
 * シナリオエイリアスをDBから取得してキャッシュする。
 * 略称・表記ゆれ → 正式名称 のマッピングを scenario_import_aliases テーブルで管理。
 * ハードコードの SCENARIO_ALIAS 定数は廃止し、このモジュールに集約する。
 *
 * バックエンド API (/api/scenario-aliases) 経由で取得する。
 * READ は staff 以上、WRITE は admin のみがサーバ側で許可される。
 */

let cachedAliases: Record<string, string> | null = null
let fetchPromise: Promise<Record<string, string>> | null = null

export async function getScenarioAliases(): Promise<Record<string, string>> {
  if (cachedAliases !== null) return cachedAliases

  // 同時リクエストを1回にまとめる
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    try {
      const map = await apiClient.get<Record<string, string>>('/api/scenario-aliases?type=map')
      cachedAliases = map ?? {}
      return cachedAliases
    } catch (error) {
      logger.warn('scenario_import_aliases の取得に失敗しました。空マップを使用します。', error)
      return {}
    }
  })().finally(() => {
    fetchPromise = null
  })

  return fetchPromise
}

/** キャッシュを強制リフレッシュ（テスト・管理画面からの更新後に呼ぶ） */
export function clearScenarioAliasCache(): void {
  cachedAliases = null
}

// ─── 管理者向け CRUD（admin のみ。現状フロントから直接呼ぶ画面はないが、将来のために用意）

export interface ScenarioAlias {
  id: string
  alias: string
  canonical_name: string
  created_at: string
}

export const scenarioAliasApi = {
  async list(): Promise<ScenarioAlias[]> {
    try {
      return await apiClient.get<ScenarioAlias[]>('/api/scenario-aliases?type=list')
    } catch (error) {
      logger.error('Failed to list scenario aliases:', error)
      throw error
    }
  },

  async create(alias: string, canonicalName: string): Promise<ScenarioAlias> {
    try {
      const created = await apiClient.post<ScenarioAlias>('/api/scenario-aliases', {
        alias,
        canonical_name: canonicalName,
      })
      clearScenarioAliasCache()
      return created
    } catch (error) {
      logger.error('Failed to create scenario alias:', error)
      throw error
    }
  },

  async update(
    id: string,
    updates: { alias?: string; canonical_name?: string }
  ): Promise<ScenarioAlias> {
    try {
      const updated = await apiClient.patch<ScenarioAlias>(
        `/api/scenario-aliases?id=${encodeURIComponent(id)}`,
        updates
      )
      clearScenarioAliasCache()
      return updated
    } catch (error) {
      logger.error('Failed to update scenario alias:', error)
      throw error
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await apiClient.delete(`/api/scenario-aliases?id=${encodeURIComponent(id)}`)
      clearScenarioAliasCache()
    } catch (error) {
      logger.error('Failed to delete scenario alias:', error)
      throw error
    }
  },
}
