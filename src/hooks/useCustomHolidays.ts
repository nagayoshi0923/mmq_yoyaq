/**
 * カスタム休日管理フック
 * 
 * GW、年末年始などのカスタム休日を管理
 * スケジュール画面から日付を右クリックして設定可能
 */
import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/utils/logger'
import { organizationSettingsApi } from '@/lib/api/organizationSettingsApi'
import { isJapaneseHoliday as isJapaneseHolidayBase } from '@/utils/japaneseHolidays'
import { showToast } from '@/utils/toast'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import { scheduleHookReadApi } from '@/lib/api/scheduleHookReadApi'

interface UseCustomHolidaysOptions {
  organizationSlug?: string // 公開ページ用：組織スラッグから取得
  organizationId?: string   // 公開ページ用：組織IDを直接指定（スラッグ不要）
}

export function useCustomHolidays(options?: UseCustomHolidaysOptions) {
  const [customHolidays, setCustomHolidays] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const { organizationSlug, organizationId } = options || {}
  const scope = JSON.stringify([organizationSlug ?? null, organizationId ?? null, options !== undefined])

  // options が渡されているが ID/slug がまだ未解決かを判定
  const hasPublicOption = options !== undefined && ('organizationSlug' in options || 'organizationId' in options)

  // 組織切替中の古い応答を適用しない。取得失敗を「休日なし」と扱わない。
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setCustomHolidays([])
    const load = async () => {
      try {
        let targetOrganizationId = organizationId
        if (organizationSlug) {
          const orgData = await resolveOrganizationFromPathSegment(organizationSlug, { requireActive: true })
          if (!orgData) throw new Error('組織の休日設定を確認できません')
          targetOrganizationId = orgData.id
        }
        let holidays: string[] = []
        if (targetOrganizationId) {
          const { data, error: rpcError } = await scheduleHookReadApi.getPublicCustomHolidays(targetOrganizationId)
          if (rpcError) throw rpcError
          holidays = data?.[0]?.custom_holidays ?? []
        } else if (!hasPublicOption) {
          holidays = await organizationSettingsApi.getCustomHolidays()
        }
        if (!cancelled) setCustomHolidays(holidays)
      } catch (loadError) {
        logger.error('カスタム休日の取得に失敗:', loadError)
        if (!cancelled) setError('休日設定を取得できません。画面を再読み込みしてください。')
      } finally {
        if (!cancelled) {
          setLoadedScope(scope)
          setIsLoading(false)
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [organizationSlug, organizationId, hasPublicOption, scope])

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
      logger.error('休日追加エラー:', error)
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
      logger.error('休日削除エラー:', error)
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
    isLoading: isLoading || loadedScope !== scope,
    error,
    addHoliday,
    removeHoliday,
    toggleHoliday,
    isCustomHoliday,
    isHoliday,
    getHolidayType
  }
}
