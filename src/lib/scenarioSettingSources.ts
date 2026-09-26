// These are the fields whose organization value can fall back to the shared master.
export const SCENARIO_SOURCE_FIELDS = [
  { field: 'title', column: 'override_title', master: 'title', label: 'タイトル', fallback: '' },
  { field: 'author', column: 'override_author', master: 'author', label: '作者表記', fallback: '' },
  { field: 'description', column: 'custom_description', master: 'description', label: '説明', fallback: '' },
  { field: 'key_visual_url', column: 'custom_key_visual_url', master: 'key_visual_url', label: '作品画像', fallback: '' },
  { field: 'duration', column: 'duration', master: 'official_duration', label: '所要時間', fallback: 120 },
  { field: 'player_count_min', column: 'override_player_count_min', master: 'player_count_min', label: '最低人数', fallback: 1 },
  { field: 'player_count_max', column: 'override_player_count_max', master: 'player_count_max', label: '最大人数', fallback: 1 },
  { field: 'genre', column: 'override_genre', master: 'genre', label: 'ジャンル', fallback: [] },
  { field: 'difficulty', column: 'override_difficulty', master: 'difficulty', label: '難易度', fallback: 3 },
  { field: 'caution', column: 'custom_caution', master: 'caution', label: '注意事項', fallback: '' },
  { field: 'sensitive_tags', column: 'custom_sensitive_tags', master: 'sensitive_tags', label: '注意が必要なテーマ', fallback: [] },
] as const
export type ScenarioSourceField = typeof SCENARIO_SOURCE_FIELDS[number]['field']
export type SourceValues = Record<string, unknown>
export interface ScenarioSourceState { stored: SourceValues; baseline: SourceValues }
export const sameSettingValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function scenarioSourcePayload(current: SourceValues, state: ScenarioSourceState, resets: SourceValues): SourceValues {
  return Object.fromEntries(SCENARIO_SOURCE_FIELDS.map(({ field, column }) => {
    const value = current[field]
    // Resetting removes the override. Editing after reset establishes a new override.
    if (Object.prototype.hasOwnProperty.call(resets, field) && sameSettingValue(value, resets[field])) return [column, null]
    // Do not turn inherited values into fixed copies when saving an unrelated field.
    if (sameSettingValue(value, state.baseline[field])) return [column, state.stored[column] ?? null]
    return [column, field === 'difficulty' && value != null ? String(value) : value ?? null]
  }))
}

export function scenarioEffectiveFields(stored: SourceValues, master: SourceValues): SourceValues {
  return Object.fromEntries(SCENARIO_SOURCE_FIELDS.map(({ field, column, master: masterKey, fallback }) => {
    const value = stored[column] ?? master[masterKey] ?? fallback
    return [field, field === 'difficulty' ? Number(value) : value]
  }))
}
