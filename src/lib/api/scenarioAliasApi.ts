import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

/**
 * シナリオエイリアスをDBから取得してキャッシュする。
 * 略称・表記ゆれ → 正式名称 のマッピングを scenario_import_aliases テーブルで管理。
 * ハードコードの SCENARIO_ALIAS 定数は廃止し、このモジュールに集約する。
 */

let cachedAliases: Record<string, string> | null = null
let fetchPromise: Promise<Record<string, string>> | null = null

export async function getScenarioAliases(): Promise<Record<string, string>> {
  if (cachedAliases !== null) return cachedAliases

  // 同時リクエストを1回にまとめる
  if (fetchPromise) return fetchPromise

  fetchPromise = (async () => {
    const { data, error } = await supabase
      .from('scenario_import_aliases')
      .select('alias, canonical_name')

    if (error) {
      logger.warn('scenario_import_aliases の取得に失敗しました。空マップを使用します。', error)
      return {}
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      map[row.alias] = row.canonical_name
    }
    cachedAliases = map
    return map
  })().finally(() => {
    fetchPromise = null
  })

  return fetchPromise
}

/** キャッシュを強制リフレッシュ（テスト・管理画面からの更新後に呼ぶ） */
export function clearScenarioAliasCache(): void {
  cachedAliases = null
}
