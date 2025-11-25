import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

export interface GlobalSettings {
  id: string
  shift_submission_start_day: number
  shift_submission_end_day: number
  shift_submission_target_months_ahead: number
  shift_edit_deadline_days_before: number // 対象月の何日前まで編集可能か
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

      // shift_edit_deadline_days_beforeが未設定の場合はデフォルト値を設定
      const settingsWithDefaults = {
        ...data,
        shift_edit_deadline_days_before: data.shift_edit_deadline_days_before || 7
      }

      setSettings(settingsWithDefaults)
    } catch (err) {
      logger.error('全体設定の取得に失敗:', err)
      setError(err as Error)
      
      // デフォルト値を設定
      setSettings({
        id: '',
        shift_submission_start_day: 1,
        shift_submission_end_day: 15,
        shift_submission_target_months_ahead: 1,
        shift_edit_deadline_days_before: 7, // デフォルト: 7日前まで編集可能
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
   * 3ヶ月先まで提出可能
   */
  const canSubmitShift = (targetDate: Date): { canSubmit: boolean; message?: string } => {
    if (!settings) {
      return { canSubmit: true }
    }

    const today = new Date()
    const currentDay = today.getDate()
    
    const { shift_submission_start_day, shift_submission_end_day, shift_submission_target_months_ahead } = settings
    
    // 現在の提出期間の開始月を判定
    let currentPeriodStartMonth = shift_submission_target_months_ahead
    
    if (currentDay > shift_submission_end_day) {
      // 提出期限を過ぎている場合は、次の提出期間に入っている
      currentPeriodStartMonth += 1
    } else if (currentDay < shift_submission_start_day) {
      // まだ提出期間が始まっていない場合は、前の提出期間
      currentPeriodStartMonth -= 1
    }

    // 提出可能な範囲：開始月から3ヶ月先まで
    const minMonth = new Date(today.getFullYear(), today.getMonth() + currentPeriodStartMonth, 1)
    const maxMonth = new Date(today.getFullYear(), today.getMonth() + currentPeriodStartMonth + 2, 1)
    
    const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)

    // 範囲チェック
    if (targetMonth < minMonth || targetMonth > maxMonth) {
      const minMonthStr = `${minMonth.getFullYear()}年${minMonth.getMonth() + 1}月`
      const maxMonthStr = `${maxMonth.getFullYear()}年${maxMonth.getMonth() + 1}月`
      
      return {
        canSubmit: false,
        message: `現在は${minMonthStr}〜${maxMonthStr}のシフトが提出可能です`
      }
    }

    return { canSubmit: true }
  }

  /**
   * シフト編集が可能かどうかをチェック
   * 編集期限 = ボタン有効期限（対象月の前月10日まで）
   */
  const canEditShift = (targetDate: Date): { canEdit: boolean; message?: string } => {
    // 編集期限はボタン有効期限と同じ（対象月の前月10日まで）
    return canActuallySubmitShift(targetDate)
  }

  /**
   * シフト提出ボタンを実際に押せるかどうかをチェック
   * 対象月の前月10日まではボタンを押せる
   */
  const canActuallySubmitShift = (targetDate: Date): { canSubmit: boolean; message?: string } => {
    if (!settings) {
      return { canSubmit: true }
    }

    const today = new Date()
    
    // 対象月の前月10日を計算
    const targetMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
    const previousMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 10)
    previousMonth.setHours(23, 59, 59, 999) // 10日の23:59:59まで有効
    
    // 前月10日を過ぎている場合は提出不可
    if (today > previousMonth) {
      return {
        canSubmit: false,
        message: '提出期限を過ぎています。変更が必要な場合はシフト制作担当者に連絡してください。'
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
    canEditShift,
    canActuallySubmitShift,
    getTargetMonth,
    refetch: fetchSettings
  }
}

