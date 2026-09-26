/**
 * 設定の適用順位。所属関係の検証はデータ取得側で行い、同一組織の層だけを渡す。
 * null / undefined は継承。false・0・空文字・空配列は明示的な指定として残す。
 * 配列（料率やリマインド日程）は1項目として置き換え、要素単位では混ぜない。
 */
export const SETTING_SCOPES = ['organization', 'store', 'scenario', 'performance'] as const
export type SettingScope = typeof SETTING_SCOPES[number]
export type SettingSource = SettingScope | 'default'
export type SettingValue = string | number | boolean | readonly unknown[] | Readonly<Record<string, unknown>>
export type SettingValues = Readonly<Record<string, SettingValue | null | undefined>>
export type SettingLayers = Partial<Record<SettingScope, SettingValues | null>>
export interface ResolvedSetting {
  value: SettingValue
  source: SettingSource
}

export const SETTING_SCOPE_LABELS: Record<SettingSource, string> = {
  default: '標準値', organization: '組織共通', store: '店舗', scenario: 'シナリオ', performance: '公演',
}

/** 組織情報など、項目に認められていないスコープの値は採用しない。 */
export function resolveSetting(
  key: string,
  fallback: SettingValue,
  layers: SettingLayers,
  allowedScopes: readonly SettingScope[] = SETTING_SCOPES,
): ResolvedSetting {
  let result: ResolvedSetting = { value: fallback, source: 'default' }
  for (const scope of SETTING_SCOPES) {
    if (!allowedScopes.includes(scope)) continue
    const layer = layers[scope]
    if (!layer || !Object.prototype.hasOwnProperty.call(layer, key)) continue
    const value = layer[key]
    if (value !== null && value !== undefined) result = { value, source: scope }
  }
  return result
}

/** 上位設定へ戻した場合の値も同じ解決規則で表示する。 */
export function resolveInheritedSetting(
  key: string,
  fallback: SettingValue,
  layers: SettingLayers,
  editingScope: SettingScope,
  allowedScopes: readonly SettingScope[] = SETTING_SCOPES,
): ResolvedSetting {
  const level = SETTING_SCOPES.indexOf(editingScope)
  return resolveSetting(key, fallback, layers, allowedScopes.filter(scope => SETTING_SCOPES.indexOf(scope) < level))
}

/** 店舗の既存値を保持し、利用者が継承を選んだ項目だけ除く。 */
export function omitInheritedSettings(values: SettingValues, inheritedKeys: readonly string[]): SettingValues {
  const inherited = new Set(inheritedKeys)
  return Object.fromEntries(Object.entries(values).filter(([key]) => !inherited.has(key)))
}
