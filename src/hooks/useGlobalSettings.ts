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
    
    const { shift_submission_start_day, shift_submission_end_day, shift_submission_target_months_ahead } = settings
    
    // 現在の提出期間を判定
    // 例：1日〜15日は翌月、16日〜月末は翌々月
    let currentPeriodMonthsAhead = shift_submission_target_months_ahead
    
    if (currentDay > shift_submission_end_day) {
      // 提出期限を過ぎている場合は、次の提出期間に入っている
      currentPeriodMonthsAhead += 1
    } else if (currentDay < shift_submission_start_day) {
      // まだ提出期間が始まっていない場合は、前の提出期間
      currentPeriodMonthsAhead -= 1
    }

    // 対象月のチェック
    const targetMonth = targetDate.getMonth()
    const targetYear = targetDate.getFullYear()
    const expectedMonth = new Date(
      today.getFullYear(),
      today.getMonth() + currentPeriodMonthsAhead,
      1
    )

    if (
      targetYear !== expectedMonth.getFullYear() ||
      targetMonth !== expectedMonth.getMonth()
    ) {
      const expectedMonthStr = `${expectedMonth.getFullYear()}年${expectedMonth.getMonth() + 1}月`
      const periodStart = shift_submission_start_day
      const periodEnd = shift_submission_end_day
      
      return {
        canSubmit: false,
        message: `現在は${expectedMonthStr}のシフトのみ提出可能です（提出期間: 前月${periodStart}日〜前月${periodEnd}日）`
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
    const currentDay = today.getDate()
    const { shift_submission_end_day, shift_submission_target_months_ahead } = settings
    
    // 現在の提出期間を判定
    let currentPeriodMonthsAhead = shift_submission_target_months_ahead
    
    if (currentDay > shift_submission_end_day) {
      // 提出期限を過ぎている場合は、次の提出期間に入っている
      currentPeriodMonthsAhead += 1
    }
    
    return new Date(
      today.getFullYear(),
      today.getMonth() + currentPeriodMonthsAhead,
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

