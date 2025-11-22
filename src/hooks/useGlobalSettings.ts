import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface GlobalSettings {
  id: string
  shift_submission_start_day: number
  shift_submission_end_day: number
  shift_submission_target_months_ahead: number
  system_name: string
  maintenance_mode: boolean
  maintenance_message: string | null
  enable_email_notifications: boolean
  enable_discord_notifications: boolean
}

/**
 * 全体設定を取得するフック
 */
export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('global_settings')
        .select('*')
        .single()

      if (fetchError) {
        throw fetchError
      }

      setSettings(data)
    } catch (err) {
      logger.error('全体設定の取得に失敗:', err)
      setError(err as Error)
      
      // デフォルト値を設定
      setSettings({
        id: '',
        shift_submission_start_day: 1,
        shift_submission_end_day: 15,
        shift_submission_target_months_ahead: 1,
        system_name: 'MMQ 予約管理システム',
        maintenance_mode: false,
        maintenance_message: null,
        enable_email_notifications: true,
        enable_discord_notifications: false
      })
    } finally {
      setLoading(false)
    }
  }

  /**
   * シフト提出が可能な期間かどうかをチェック
   */
  const canSubmitShift = (targetDate: Date): { canSubmit: boolean; message?: string } => {
    if (!settings) {
      return { canSubmit: true }
    }

    const today = new Date()
    const currentDay = today.getDate()
    
    // 提出期間のチェック
    const { shift_submission_start_day, shift_submission_end_day } = settings
    
    if (currentDay < shift_submission_start_day) {
      return {
        canSubmit: false,
        message: `シフト提出は毎月${shift_submission_start_day}日から可能です`
      }
    }
    
    if (currentDay > shift_submission_end_day) {
      return {
        canSubmit: false,
        message: `シフト提出期限（${shift_submission_end_day}日）を過ぎています`
      }
    }

    // 対象月のチェック
    const targetMonth = targetDate.getMonth()
    const targetYear = targetDate.getFullYear()
    const expectedMonth = new Date(
      today.getFullYear(),
      today.getMonth() + settings.shift_submission_target_months_ahead,
      1
    )

    if (
      targetYear !== expectedMonth.getFullYear() ||
      targetMonth !== expectedMonth.getMonth()
    ) {
      const expectedMonthStr = `${expectedMonth.getFullYear()}年${expectedMonth.getMonth() + 1}月`
      return {
        canSubmit: false,
        message: `現在は${expectedMonthStr}のシフトのみ提出可能です`
      }
    }

    return { canSubmit: true }
  }

  /**
   * シフト提出可能な対象月を取得
   */
  const getTargetMonth = (): Date => {
    if (!settings) {
      const today = new Date()
      return new Date(today.getFullYear(), today.getMonth() + 1, 1)
    }

    const today = new Date()
    return new Date(
      today.getFullYear(),
      today.getMonth() + settings.shift_submission_target_months_ahead,
      1
    )
  }

  return {
    settings,
    loading,
    error,
    canSubmitShift,
    getTargetMonth,
    refetch: fetchSettings
  }
}

