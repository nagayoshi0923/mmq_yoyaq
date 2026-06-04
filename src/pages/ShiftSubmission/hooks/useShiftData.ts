import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { shiftApi } from '@/lib/shiftApi'
import { useOrganization } from '@/hooks/useOrganization'
import { Sentry } from '@/lib/sentry'
import type { ShiftSubmission, DayInfo } from '../types'

interface UseShiftDataProps {
  currentDate: Date
  monthDays: DayInfo[]
}

async function fetchShiftData(
  staffId: string,
  year: number,
  month: number
): Promise<Record<string, ShiftSubmission>> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const existingShifts = await shiftApi.getStaffShifts(staffId, year, month) as ShiftSubmission[]

  const newShiftData: Record<string, ShiftSubmission> = {}
  for (let day = 1; day <= daysInMonth; day++) {
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const existingShift = existingShifts.find((s: ShiftSubmission) => s.date === dateString)
    newShiftData[dateString] = existingShift ?? {
      id: '',
      staff_id: staffId,
      date: dateString,
      morning: false,
      afternoon: false,
      evening: false,
      all_day: false,
      submitted_at: '',
      status: 'draft' as const
    }
  }

  // localStorageの下書きを復元（提出済みでない場合のみ）
  const draftKey = `shift_draft_${staffId}_${year}-${month}`
  const draftData = localStorage.getItem(draftKey)
  if (draftData) {
    try {
      const draft = JSON.parse(draftData)
      Object.keys(draft).forEach(date => {
        if (newShiftData[date] && newShiftData[date].status !== 'submitted') {
          newShiftData[date] = {
            ...newShiftData[date],
            ...draft[date],
            id: newShiftData[date].id,
            staff_id: staffId,
            date,
          }
        }
      })
    } catch (e) {
      logger.error('下書きデータの復元に失敗:', e)
    }
  }

  return newShiftData
}

/**
 * シフトデータ管理フック
 */
export function useShiftData({ currentDate, monthDays }: UseShiftDataProps) {
  const { staff } = useOrganization()
  const currentStaffId = staff?.id ?? ''

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  const shiftQuery = useQuery({
    queryKey: ['shift-data', currentStaffId, year, month],
    queryFn: () => fetchShiftData(currentStaffId, year, month),
    enabled: !!currentStaffId,
  })

  // サーバーデータから初期化するローカル編集用 state
  const [shiftData, setShiftData] = useState<Record<string, ShiftSubmission>>({})
  // 提出処理中のローディング状態（クエリのローディングとは別管理）
  const [submitLoading, setSubmitLoading] = useState(false)

  useEffect(() => {
    if (shiftQuery.data) {
      setShiftData(shiftQuery.data)
    }
  }, [shiftQuery.data])

  // スタッフが未設定のときのエラー通知（初回のみ）
  useEffect(() => {
    if (!currentStaffId && staff !== undefined && !shiftQuery.isLoading) {
      showToast.error(
        'スタッフ情報が見つかりません',
        'このアカウントはスタッフとして登録されていません。管理者に連絡してスタッフ登録を依頼してください。'
      )
      // シフト提出ページに到達した時点でスタッフ扱いされてる前提なのに、
      // staff レコードが取れないのは異常（auth レース or DB 不整合の可能性）。
      // Sentry に通知して GitHub Issue で追跡できるようにする。
      Sentry.captureMessage('shift-page: staff record missing', {
        level: 'warning',
        tags: { issue: 'staff-record-missing', page: 'shift-submission' },
        extra: {
          staffIsNull: staff === null,
        },
      })
    }
  }, [currentStaffId, staff, shiftQuery.isLoading])

  const handleShiftChange = (date: string, timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day', checked: boolean) => {
    setShiftData(prev => {
      const baseData = prev[date] || {
        id: '',
        staff_id: currentStaffId || '',
        date,
        morning: false,
        afternoon: false,
        evening: false,
        all_day: false,
        submitted_at: '',
        status: 'draft' as const
      }

      const newData = {
        ...prev,
        [date]: {
          ...baseData,
          [timeSlot]: checked,
          ...(timeSlot === 'all_day' && checked ? { morning: true, afternoon: true, evening: true } : {}),
          ...(timeSlot !== 'all_day' ? {
            all_day: timeSlot === 'morning'
              ? (checked && baseData.afternoon && baseData.evening)
              : timeSlot === 'afternoon'
              ? (checked && baseData.morning && baseData.evening)
              : (checked && baseData.morning && baseData.afternoon)
          } : {})
        }
      }

      if (currentStaffId && newData[date]?.status !== 'submitted') {
        const key = `shift_draft_${currentStaffId}_${year}-${month}`
        localStorage.setItem(key, JSON.stringify(newData))
      }

      return newData
    })
  }

  const handleSelectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    monthDays.forEach(day => {
      const baseData = newShiftData[day.date] || {
        id: '', staff_id: currentStaffId || '', date: day.date,
        morning: false, afternoon: false, evening: false, all_day: false,
        submitted_at: '', status: 'draft' as const
      }
      newShiftData[day.date] = {
        ...baseData,
        [timeSlot]: true,
        ...(timeSlot === 'all_day' ? { morning: true, afternoon: true, evening: true } : {})
      }
    })

    const hasSubmittedData = Object.values(newShiftData).some(shift => shift.status === 'submitted')
    if (currentStaffId && !hasSubmittedData) {
      localStorage.setItem(`shift_draft_${currentStaffId}_${year}-${month}`, JSON.stringify(newShiftData))
    }
    setShiftData(newShiftData)
  }

  const handleDeselectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    monthDays.forEach(day => {
      const baseData = newShiftData[day.date] || {
        id: '', staff_id: currentStaffId || '', date: day.date,
        morning: false, afternoon: false, evening: false, all_day: false,
        submitted_at: '', status: 'draft' as const
      }
      newShiftData[day.date] = {
        ...baseData,
        [timeSlot]: false,
        ...(timeSlot === 'all_day' ? { morning: false, afternoon: false, evening: false } : {})
      }
    })

    const hasSubmittedData = Object.values(newShiftData).some(shift => shift.status === 'submitted')
    if (currentStaffId && !hasSubmittedData) {
      localStorage.setItem(`shift_draft_${currentStaffId}_${year}-${month}`, JSON.stringify(newShiftData))
    }
    setShiftData(newShiftData)
  }

  const reloadShiftData = useCallback(async () => {
    await shiftQuery.refetch()
  }, [shiftQuery])

  return {
    shiftData,
    setShiftData,
    loading: shiftQuery.isLoading || submitLoading,
    setLoading: setSubmitLoading,
    currentStaffId,
    handleShiftChange,
    handleSelectAll,
    handleDeselectAll,
    reloadShiftData,
  }
}
