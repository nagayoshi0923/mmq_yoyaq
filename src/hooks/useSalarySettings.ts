import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

export interface SalarySettings {
  gm_base_pay: number
  gm_hourly_rate: number
  gm_test_base_pay: number
  gm_test_hourly_rate: number
  reception_fixed_pay: number
}

// デフォルト値
const DEFAULT_SETTINGS: SalarySettings = {
  gm_base_pay: 2000,
  gm_hourly_rate: 1300,
  gm_test_base_pay: 0,
  gm_test_hourly_rate: 1300,
  reception_fixed_pay: 2000
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
        .select('gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay')
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
          reception_fixed_pay: data.reception_fixed_pay ?? DEFAULT_SETTINGS.reception_fixed_pay
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
    const hours = durationMinutes / 60
    
    if (isGmTest) {
      return settings.gm_test_base_pay + Math.round(settings.gm_test_hourly_rate * hours)
    }
    return settings.gm_base_pay + Math.round(settings.gm_hourly_rate * hours)
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
      .select('gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay')
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
        reception_fixed_pay: data.reception_fixed_pay ?? DEFAULT_SETTINGS.reception_fixed_pay
      }
    }

    return DEFAULT_SETTINGS
  } catch (error) {
    logger.error('給与設定取得エラー:', error)
    return DEFAULT_SETTINGS
  }
}

/**
 * GM給与を計算するユーティリティ関数
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
  const hours = durationMinutes / 60
  
  if (isGmTest) {
    return settings.gm_test_base_pay + Math.round(settings.gm_test_hourly_rate * hours)
  }
  return settings.gm_base_pay + Math.round(settings.gm_hourly_rate * hours)
}

