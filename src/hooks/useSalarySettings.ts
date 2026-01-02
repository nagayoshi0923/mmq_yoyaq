import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

export interface HourlyRate {
  hours: number  // 0.5 = 30分、1 = 1時間、1.5 = 1時間30分...
  amount: number
}

export interface SalarySettings {
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
  use_hourly_table: boolean
  hourly_rates: HourlyRate[]
  gm_test_hourly_rates: HourlyRate[]
}

// デフォルト値
const DEFAULT_SETTINGS: SalarySettings = {
  gm_base_pay: 2000,
  gm_hourly_rate: 1300,
  gm_test_base_pay: 0,
  gm_test_hourly_rate: 1300,
  reception_fixed_pay: 2000,
  use_hourly_table: false,
  hourly_rates: [
    { hours: 1, amount: 3300 },
    { hours: 1.5, amount: 3950 },
    { hours: 2, amount: 4600 },
    { hours: 2.5, amount: 5250 },
    { hours: 3, amount: 5900 },
    { hours: 3.5, amount: 6550 },
    { hours: 4, amount: 7200 },
  ],
  gm_test_hourly_rates: [
    { hours: 1, amount: 1300 },
    { hours: 1.5, amount: 1950 },
    { hours: 2, amount: 2600 },
    { hours: 2.5, amount: 3250 },
    { hours: 3, amount: 3900 },
    { hours: 3.5, amount: 4550 },
    { hours: 4, amount: 5200 },
  ]
}

/**
 * 給与設定を取得するフック
 * global_settingsテーブルから組織ごとの給与計算用の設定値を取得
 */
export function useSalarySettings() {
  const [settings, setSettings] = useState<SalarySettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      // 現在の組織IDを取得
      const organizationId = await getCurrentOrganizationId()
      if (!organizationId) {
        logger.error('組織IDが取得できませんでした')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .single()

      if (error) {
        logger.error('給与設定の取得に失敗:', error)
        return
      }

      if (data) {
        setSettings({
          gm_base_pay: data.gm_base_pay ?? DEFAULT_SETTINGS.gm_base_pay,
          gm_hourly_rate: data.gm_hourly_rate ?? DEFAULT_SETTINGS.gm_hourly_rate,
          gm_test_base_pay: data.gm_test_base_pay ?? DEFAULT_SETTINGS.gm_test_base_pay,
          gm_test_hourly_rate: data.gm_test_hourly_rate ?? DEFAULT_SETTINGS.gm_test_hourly_rate,
          reception_fixed_pay: data.reception_fixed_pay ?? DEFAULT_SETTINGS.reception_fixed_pay,
          use_hourly_table: data.use_hourly_table ?? DEFAULT_SETTINGS.use_hourly_table,
          hourly_rates: (data.hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.hourly_rates,
          gm_test_hourly_rates: (data.gm_test_hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.gm_test_hourly_rates
        })
      }
    } catch (error) {
      logger.error('給与設定取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  /**
   * GM給与を計算
   * @param durationMinutes 公演時間（分）
   * @param isGmTest GMテストかどうか
   * @returns 給与額
   */
  const calculateGmWage = useCallback((durationMinutes: number, isGmTest: boolean): number => {
    return calculateGmWageFromSettings(durationMinutes, isGmTest, settings)
  }, [settings])

  return {
    settings,
    loading,
    calculateGmWage,
    refresh: fetchSettings
  }
}

/**
 * 給与設定を一度だけ取得する関数（非リアクティブ）
 * フックを使えない場所での利用用
 */
export async function fetchSalarySettings(): Promise<SalarySettings> {
  try {
    // 現在の組織IDを取得
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      logger.error('組織IDが取得できませんでした')
      return DEFAULT_SETTINGS
    }

    const { data, error } = await supabase
      .from('global_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      logger.error('給与設定の取得に失敗:', error)
      return DEFAULT_SETTINGS
    }

    if (data) {
      return {
        gm_base_pay: data.gm_base_pay ?? DEFAULT_SETTINGS.gm_base_pay,
        gm_hourly_rate: data.gm_hourly_rate ?? DEFAULT_SETTINGS.gm_hourly_rate,
        gm_test_base_pay: data.gm_test_base_pay ?? DEFAULT_SETTINGS.gm_test_base_pay,
        gm_test_hourly_rate: data.gm_test_hourly_rate ?? DEFAULT_SETTINGS.gm_test_hourly_rate,
        reception_fixed_pay: data.reception_fixed_pay ?? DEFAULT_SETTINGS.reception_fixed_pay,
        use_hourly_table: data.use_hourly_table ?? DEFAULT_SETTINGS.use_hourly_table,
        hourly_rates: (data.hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.hourly_rates,
        gm_test_hourly_rates: (data.gm_test_hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.gm_test_hourly_rates
      }
    }

    return DEFAULT_SETTINGS
  } catch (error) {
    logger.error('給与設定取得エラー:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * 時間別テーブルから報酬を取得
 * 完全一致がない場合は、最も近い小さい値を使用
 * @param hours 時間（0.5刻み）
 * @param rates 時間別報酬テーブル
 * @param fallbackRate 見つからない場合のフォールバック時給
 * @param fallbackBase 見つからない場合のフォールバック基本給
 * @returns 報酬額
 */
function getAmountFromHourlyTable(
  hours: number, 
  rates: HourlyRate[], 
  fallbackRate: number, 
  fallbackBase: number
): number {
  // 30分単位に丸める（例: 2.3 → 2.5, 2.7 → 3.0）
  const roundedHours = Math.ceil(hours * 2) / 2
  
  // 完全一致を検索
  const exactMatch = rates.find(r => r.hours === roundedHours)
  if (exactMatch) {
    return exactMatch.amount
  }
  
  // 完全一致がない場合、最も近い大きい値を検索
  const sortedRates = [...rates].sort((a, b) => a.hours - b.hours)
  const closestLarger = sortedRates.find(r => r.hours >= roundedHours)
  if (closestLarger) {
    return closestLarger.amount
  }
  
  // テーブルの最大値を超える場合、最大値の報酬 + 超過分を時給計算
  const maxRate = sortedRates[sortedRates.length - 1]
  if (maxRate) {
    const extraHours = roundedHours - maxRate.hours
    return maxRate.amount + Math.round(fallbackRate * extraHours)
  }
  
  // テーブルが空の場合は従来の計算式
  return fallbackBase + Math.round(fallbackRate * hours)
}

/**
 * GM給与を計算するユーティリティ関数
 * 時間別テーブル方式と計算式方式の両方に対応
 * @param durationMinutes 公演時間（分）
 * @param isGmTest GMテストかどうか
 * @param settings 給与設定
 * @returns 給与額
 */
export function calculateGmWage(
  durationMinutes: number, 
  isGmTest: boolean, 
  settings: SalarySettings
): number {
  return calculateGmWageFromSettings(durationMinutes, isGmTest, settings)
}

/**
 * GM給与を計算する内部関数
 */
function calculateGmWageFromSettings(
  durationMinutes: number, 
  isGmTest: boolean, 
  settings: SalarySettings
): number {
  const hours = durationMinutes / 60
  
  // 時間別テーブル方式を使用する場合
  if (settings.use_hourly_table) {
    if (isGmTest) {
      return getAmountFromHourlyTable(
        hours, 
        settings.gm_test_hourly_rates, 
        settings.gm_test_hourly_rate,
        settings.gm_test_base_pay
      )
    }
    return getAmountFromHourlyTable(
      hours, 
      settings.hourly_rates, 
      settings.gm_hourly_rate,
      settings.gm_base_pay
    )
  }
  
  // 計算式方式（従来通り）
  if (isGmTest) {
    return settings.gm_test_base_pay + Math.round(settings.gm_test_hourly_rate * hours)
  }
  return settings.gm_base_pay + Math.round(settings.gm_hourly_rate * hours)
}

/**
 * 特定の日付時点で有効だった報酬設定を取得
 * @param performanceDate 公演日（YYYY-MM-DD形式）
 * @returns その日付時点で有効だった報酬設定
 */
export async function fetchSalarySettingsForDate(performanceDate: string): Promise<SalarySettings> {
  try {
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) {
      logger.error('組織IDが取得できませんでした')
      return DEFAULT_SETTINGS
    }

    // 履歴テーブルから、公演日以前で最新の設定を取得
    const { data: historyData, error: historyError } = await supabase
      .from('salary_settings_history')
      .select('*')
      .eq('organization_id', organizationId)
      .lte('effective_from', performanceDate)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single()

    if (!historyError && historyData) {
      return {
        gm_base_pay: historyData.gm_base_pay ?? DEFAULT_SETTINGS.gm_base_pay,
        gm_hourly_rate: historyData.gm_hourly_rate ?? DEFAULT_SETTINGS.gm_hourly_rate,
        gm_test_base_pay: historyData.gm_test_base_pay ?? DEFAULT_SETTINGS.gm_test_base_pay,
        gm_test_hourly_rate: historyData.gm_test_hourly_rate ?? DEFAULT_SETTINGS.gm_test_hourly_rate,
        reception_fixed_pay: historyData.reception_fixed_pay ?? DEFAULT_SETTINGS.reception_fixed_pay,
        use_hourly_table: historyData.use_hourly_table ?? DEFAULT_SETTINGS.use_hourly_table,
        hourly_rates: (historyData.hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.hourly_rates,
        gm_test_hourly_rates: (historyData.gm_test_hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.gm_test_hourly_rates
      }
    }

    // 履歴がない場合は現在の設定を使用
    return fetchSalarySettings()
  } catch (error) {
    logger.error('報酬設定履歴取得エラー:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * 特定の日付時点で有効だった報酬を計算
 * @param durationMinutes 公演時間（分）
 * @param isGmTest GMテストかどうか
 * @param performanceDate 公演日（YYYY-MM-DD形式）
 * @returns 報酬額
 */
export async function calculateGmWageForDate(
  durationMinutes: number,
  isGmTest: boolean,
  performanceDate: string
): Promise<number> {
  const settings = await fetchSalarySettingsForDate(performanceDate)
  return calculateGmWageFromSettings(durationMinutes, isGmTest, settings)
}
