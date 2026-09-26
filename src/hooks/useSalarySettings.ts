import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { salaryReportApi } from '@/lib/api/salaryReportApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

import { calculateGmWage as calculateGmWageFromSettings, createSalarySettingsResolver, type HourlyRate, type SalarySettings, type SalarySettingsResolver } from '@/lib/compensation'
export { calculateGmWage, createSalarySettingsResolver } from '@/lib/compensation'
export type { HourlyRate, SalarySettings, SalarySettingsResolver } from '@/lib/compensation'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const SALARY_SETTINGS_SELECT_FIELDS =
  'organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay, use_hourly_table, hourly_rates, gm_test_hourly_rates, updated_at' as const

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
        .select(SALARY_SETTINGS_SELECT_FIELDS)
        .eq('organization_id', organizationId)
        .single()

      if (error) {
        logger.error('給与設定の取得に失敗:', error)
        return
      }

      // 履歴から有効期間を取得
      let effectiveFrom: string | undefined
      let effectiveUntil: string | null = null

      const today = new Date().toISOString().split('T')[0]
      
      // 現在有効な設定を取得（effective_from <= 今日 で最新）
      const { data: currentHistory } = await supabase
        .from('salary_settings_history')
        .select('effective_from')
        .eq('organization_id', organizationId)
        .lte('effective_from', today)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (currentHistory) {
        effectiveFrom = currentHistory.effective_from
        
        // 次の設定があれば、その日の前日が終了日（無いときは 0 件。single() だと 406 になる）
        const { data: nextHistory } = await supabase
          .from('salary_settings_history')
          .select('effective_from')
          .eq('organization_id', organizationId)
          .gt('effective_from', currentHistory.effective_from)
          .order('effective_from', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextHistory) {
          // 次の設定のeffective_fromの前日
          const nextDate = new Date(nextHistory.effective_from)
          nextDate.setDate(nextDate.getDate() - 1)
          effectiveUntil = nextDate.toISOString().split('T')[0]
        }
        // nextHistoryがなければnull = 現在まで有効
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
          gm_test_hourly_rates: (data.gm_test_hourly_rates as HourlyRate[] | null) ?? DEFAULT_SETTINGS.gm_test_hourly_rates,
          updated_at: data.updated_at,
          effective_from: effectiveFrom,
          effective_until: effectiveUntil
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
      .select(SALARY_SETTINGS_SELECT_FIELDS)
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

/** 期間開始以前の直近1件と期間中の変更を組織単位でまとめて取得する。 */
export async function fetchSalarySettingsForPeriod(
  startDate: string, endDate: string, organizationId: string
): Promise<SalarySettingsResolver> {
  if (!organizationId) throw new Error('組織を確認できないため給与を計算できません。再ログインしてください。')
  if (startDate > endDate) throw new Error('給与設定の取得期間が不正です。')
  try {
    const { history } = await salaryReportApi.history(startDate, endDate, organizationId)
    return createSalarySettingsResolver(history)
  } catch (error) {
    logger.error('報酬設定履歴取得エラー:', error)
    throw new Error('給与設定の履歴を取得できませんでした。通信状況と閲覧権限を確認して再試行してください。')
  }
}

export async function fetchSalarySettingsForDate(performanceDate: string): Promise<SalarySettings> {
  const organizationId = await getCurrentOrganizationId()
  const resolve = await fetchSalarySettingsForPeriod(performanceDate, performanceDate, organizationId ?? '')
  return resolve(performanceDate)
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
