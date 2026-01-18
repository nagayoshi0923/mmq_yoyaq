/**
 * 公演時間帯設定を取得するhooks
 * 平日/休日・祝日に応じたデフォルト時間を提供
 */
import { logger } from '@/utils/logger'
import { useState, useEffect, useCallback } from 'react'
import { organizationSettingsApi, type TimeSlotSettings, type DayTypeTimeSlots } from '@/lib/api/organizationSettingsApi'

// 日本の祝日（年ごとに更新が必要）
const HOLIDAYS_2025 = [
  '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23', '2025-02-24',
  '2025-03-20', '2025-04-29', '2025-05-03', '2025-05-04', '2025-05-05',
  '2025-05-06', '2025-07-21', '2025-08-11', '2025-09-15', '2025-09-23',
  '2025-10-13', '2025-11-03', '2025-11-23', '2025-11-24', '2025-12-23'
]

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23',
  '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-05-06', '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22',
  '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23', '2026-12-23'
]

const HOLIDAYS = [...HOLIDAYS_2025, ...HOLIDAYS_2026]

/**
 * 指定日が休日（土日または祝日）かどうかを判定
 */
export function isHoliday(date: string): boolean {
  const d = new Date(date)
  const dayOfWeek = d.getDay()
  
  // 土曜(6)または日曜(0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true
  }
  
  // 祝日
  return HOLIDAYS.includes(date)
}

// デフォルト設定（DBから取得できない場合のフォールバック）
const DEFAULT_SETTINGS: TimeSlotSettings = {
  weekday: {
    morning: { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening: { start_time: '19:00', end_time: '23:00' }
  },
  holiday: {
    morning: { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening: { start_time: '19:00', end_time: '23:00' }
  }
}

/**
 * 公演時間帯設定を取得するhooks
 */
export function useTimeSlotSettings() {
  const [settings, setSettings] = useState<TimeSlotSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await organizationSettingsApi.getTimeSlotSettings()
        setSettings(data)
      } catch (error) {
        logger.error('Failed to load time slot settings:', error)
        // エラー時はデフォルト設定を使用
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  /**
   * 指定日のデフォルト時間を取得
   */
  const getDefaultsForDate = useCallback((date: string): DayTypeTimeSlots => {
    return isHoliday(date) ? settings.holiday : settings.weekday
  }, [settings])

  /**
   * 指定日・時間帯のデフォルト時間を取得
   */
  const getSlotDefaults = useCallback((
    date: string,
    slot: 'morning' | 'afternoon' | 'evening'
  ): { start_time: string; end_time: string } => {
    const daySettings = getDefaultsForDate(date)
    return daySettings[slot]
  }, [getDefaultsForDate])

  return {
    settings,
    isLoading,
    isHoliday,
    getDefaultsForDate,
    getSlotDefaults
  }
}

// 型エクスポート
export type { TimeSlotSettings, DayTypeTimeSlots }


