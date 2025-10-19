import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { shiftApi } from '@/lib/shiftApi'
import type { ShiftSubmission, DayInfo } from '../types'

interface UseShiftDataProps {
  currentDate: Date
  monthDays: DayInfo[]
}

/**
 * シフトデータ管理フック
 */
export function useShiftData({ currentDate, monthDays }: UseShiftDataProps) {
  const [shiftData, setShiftData] = useState<Record<string, ShiftSubmission>>({})
  const [loading, setLoading] = useState(false)
  const [currentStaffId, setCurrentStaffId] = useState<string>('')

  /**
   * 現在のスタッフIDを取得
   */
  useEffect(() => {
    const getCurrentStaff = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: staffData } = await supabase
          .from('staff')
          .select('id')
          .eq('email', user.email)
          .single()
        
        if (staffData) {
          setCurrentStaffId(staffData.id)
        }
      }
    }
    getCurrentStaff()
  }, [])

  /**
   * シフトデータの初期化・読み込み
   */
  useEffect(() => {
    if (!currentStaffId) return
    
    const loadShiftData = async () => {
      setLoading(true)
      try {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        // データベースから既存のシフトを取得
        const existingShifts = await shiftApi.getStaffShifts(currentStaffId, year, month)
        
        // 月の日数を取得
        const daysInMonth = new Date(year, month, 0).getDate()
        const newShiftData: Record<string, ShiftSubmission> = {}
        
        for (let day = 1; day <= daysInMonth; day++) {
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          
          // 既存のシフトがあればそれを使用、なければデフォルト値
          const existingShift = existingShifts.find((s: ShiftSubmission) => s.date === dateString)
          
          newShiftData[dateString] = existingShift || {
            id: '', // 新規の場合は空
            staff_id: currentStaffId,
            date: dateString,
            morning: false,
            afternoon: false,
            evening: false,
            all_day: false,
            submitted_at: '',
            status: 'draft'
          }
        }
        
        setShiftData(newShiftData)
      } catch (error) {
        console.error('シフトデータの読み込みに失敗しました:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadShiftData()
  }, [currentStaffId, currentDate])

  /**
   * シフト変更ハンドラ
   */
  const handleShiftChange = (date: string, timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day', checked: boolean) => {
    setShiftData(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [timeSlot]: checked,
        // 終日がチェックされた場合、他の時間帯もチェック
        ...(timeSlot === 'all_day' && checked ? {
          morning: true,
          afternoon: true,
          evening: true
        } : {}),
        // 他の時間帯がすべてチェックされた場合、終日もチェック
        ...(timeSlot !== 'all_day' ? {
          all_day: timeSlot === 'morning' ? 
            (checked && prev[date]?.afternoon && prev[date]?.evening) :
            timeSlot === 'afternoon' ?
            (checked && prev[date]?.morning && prev[date]?.evening) :
            (checked && prev[date]?.morning && prev[date]?.afternoon)
        } : {})
      }
    }))
  }

  /**
   * 全てチェック
   */
  const handleSelectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    
    monthDays.forEach(day => {
      if (newShiftData[day.date]) {
        newShiftData[day.date] = {
          ...newShiftData[day.date],
          [timeSlot]: true,
          // 終日が選択された場合、他の時間帯もチェック
          ...(timeSlot === 'all_day' ? {
            morning: true,
            afternoon: true,
            evening: true
          } : {})
        }
      }
    })
    
    setShiftData(newShiftData)
  }

  /**
   * 全て解除
   */
  const handleDeselectAll = (timeSlot: 'morning' | 'afternoon' | 'evening' | 'all_day') => {
    const newShiftData = { ...shiftData }
    
    monthDays.forEach(day => {
      if (newShiftData[day.date]) {
        newShiftData[day.date] = {
          ...newShiftData[day.date],
          [timeSlot]: false,
          // 終日が解除された場合、他の時間帯も解除
          ...(timeSlot === 'all_day' ? {
            morning: false,
            afternoon: false,
            evening: false
          } : {})
        }
      }
    })
    
    setShiftData(newShiftData)
  }

  return {
    shiftData,
    setShiftData,
    loading,
    setLoading,
    currentStaffId,
    handleShiftChange,
    handleSelectAll,
    handleDeselectAll
  }
}

