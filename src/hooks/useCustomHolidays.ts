/**
 * カスタム休日管理フック
 * 
 * GW、年末年始などのカスタム休日を管理
 * スケジュール画面から日付を右クリックして設定可能
 */
import { useState, useEffect, useCallback } from 'react'
import { organizationSettingsApi } from '@/lib/api/organizationSettingsApi'
import { isJapaneseHoliday as isJapaneseHolidayBase } from '@/utils/japaneseHolidays'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabase'

interface UseCustomHolidaysOptions {
  organizationSlug?: string // 公開ページ用：組織スラッグから取得
}

export function useCustomHolidays(options?: UseCustomHolidaysOptions) {
  const [customHolidays, setCustomHolidays] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { organizationSlug } = options || {}

  // 初期ロード
  useEffect(() => {
    const load = async () => {
      try {
        // 組織スラッグが指定されている場合は、スラッグから組織IDを取得して休日を取得
        if (organizationSlug) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', organizationSlug)
            .eq('is_active', true)
            .single()
          
          if (orgData) {
            const settings = await organizationSettingsApi.getByOrganizationId(orgData.id)
            setCustomHolidays(settings?.custom_holidays || [])
            setIsLoading(false)
            return
          }
        }
        
        // 通常の取得（ログインユーザーの組織）
        const holidays = await organizationSettingsApi.getCustomHolidays()
        setCustomHolidays(holidays)
      } catch (error) {
        console.error('カスタム休日の取得に失敗:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [organizationSlug])

  // 休日を追加
  const addHoliday = useCallback(async (date: string) => {
    try {
      await organizationSettingsApi.addCustomHoliday(date)
      setCustomHolidays(prev => {
        if (prev.includes(date)) return prev
        return [...prev, date].sort()
      })
      showToast.success(`${date} を休日に設定しました`)
    } catch (error) {
      console.error('休日追加エラー:', error)
      showToast.error('休日の追加に失敗しました')
    }
  }, [])

  // 休日を削除
  const removeHoliday = useCallback(async (date: string) => {
    try {
      await organizationSettingsApi.removeCustomHoliday(date)
      setCustomHolidays(prev => prev.filter(d => d !== date))
      showToast.success(`${date} の休日設定を解除しました`)
    } catch (error) {
      console.error('休日削除エラー:', error)
      showToast.error('休日の解除に失敗しました')
    }
  }, [])

  // 休日をトグル
  const toggleHoliday = useCallback(async (date: string) => {
    if (customHolidays.includes(date)) {
      await removeHoliday(date)
    } else {
      await addHoliday(date)
    }
  }, [customHolidays, addHoliday, removeHoliday])

  // カスタム休日かどうか判定
  const isCustomHoliday = useCallback((date: string): boolean => {
    return customHolidays.includes(date)
  }, [customHolidays])

  // 休日かどうか判定（祝日 + カスタム休日）
  const isHoliday = useCallback((date: string): boolean => {
    const dateObj = new Date(date)
    const dayOfWeek = dateObj.getDay()
    // 土日
    if (dayOfWeek === 0 || dayOfWeek === 6) return true
    // 祝日
    if (isJapaneseHolidayBase(date)) return true
    // カスタム休日
    if (customHolidays.includes(date)) return true
    return false
  }, [customHolidays])

  // 休日の種類を取得
  const getHolidayType = useCallback((date: string): 'weekend' | 'national' | 'custom' | null => {
    const dateObj = new Date(date)
    const dayOfWeek = dateObj.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend'
    if (isJapaneseHolidayBase(date)) return 'national'
    if (customHolidays.includes(date)) return 'custom'
    return null
  }, [customHolidays])

  return {
    customHolidays,
    isLoading,
    addHoliday,
    removeHoliday,
    toggleHoliday,
    isCustomHoliday,
    isHoliday,
    getHolidayType
  }
}
