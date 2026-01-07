/**
 * フィーチャーフラグ管理
 * 新機能の段階的リリースやA/Bテストに使用
 * 
 * 環境変数でオーバーライド可能:
 * VITE_FF_USE_NEW_SCENARIO_SCHEMA=true
 * VITE_FF_SHOW_PLATFORM_TOP=false
 */

export const FEATURE_FLAGS = {
  /**
   * 新シナリオデータ構造を使用するか
   * true: scenario_masters + organization_scenarios を使用
   * false: 従来の scenarios テーブルを使用
   * 
   * 有効化の前提条件:
   * 1. database/migrations/create_scenario_masters.sql を実行
   * 2. database/migrations/migrate_scenarios_to_masters.sql を実行
   * 
   * UIでの切り替えは ScenarioManagement ページの「新UI（マスタ連携）」で可能
   */
  USE_NEW_SCENARIO_SCHEMA: false,
  
  /**
   * プラットフォームトップページを表示するか
   */
  SHOW_PLATFORM_TOP: true,
} as const

/**
 * フィーチャーフラグの値を取得
 */
export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  // 環境変数でオーバーライド可能
  const envKey = `VITE_FF_${flag}`
  const envValue = import.meta.env[envKey]
  
  if (envValue !== undefined) {
    return envValue === 'true'
  }
  
  return FEATURE_FLAGS[flag]
}


