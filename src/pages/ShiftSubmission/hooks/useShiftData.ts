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
        const { data: staffData, error } = await supabase
          .from('staff')
          .select('id, name')
          .eq('user_id', user.id)
          .maybeSingle()
        
        console.log('📋 スタッフ検索:', { userId: user.id, email: user.email, staffData, error })
        
        if (staffData) {
          setCurrentStaffId(staffData.id)
        } else {
          console.error('❌ スタッフデータが見つかりません:', user.email)
          alert(`スタッフ情報が見つかりません。\nログイン中: ${user.email}\n\n管理者に連絡してスタッフ登録を依頼してください。`)
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
        const month = currentDate.getMonth() // 0-11に変更
        const monthForApi = month + 1 // API用は1-12
        
        // データベースから既存のシフトを取得
        const existingShifts = await shiftApi.getStaffShifts(currentStaffId, year, monthForApi)
        
        // 月の日数を取得
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const newShiftData: Record<string, ShiftSubmission> = {}
        
        for (let day = 1; day <= daysInMonth; day++) {
          const dateString = `${year}-${String(monthForApi).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          
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
        
        // localStorageから下書きを復元（提出済みでない場合のみ）
        const draftKey = `shift_draft_${currentStaffId}_${year}-${monthForApi}`
        const draftData = localStorage.getItem(draftKey)
        if (draftData) {
          try {
            const draft = JSON.parse(draftData)
            // 下書きデータをマージ（提出済みでなければ下書きを優先）
            Object.keys(draft).forEach(date => {
              if (newShiftData[date] && newShiftData[date].status !== 'submitted') {
                newShiftData[date] = {
                  ...newShiftData[date],
                  ...draft[date],
                  id: newShiftData[date].id, // IDは保持
                  staff_id: currentStaffId,
                  date: date
                }
              }
            })
          } catch (e) {
            console.error('下書きデータの復元に失敗:', e)
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
    setShiftData(prev => {
      const newData = {
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
      }
      
      // localStorageに自動保存（下書き）
      if (currentStaffId) {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        const key = `shift_draft_${currentStaffId}_${year}-${month}`
        localStorage.setItem(key, JSON.stringify(newData))
      }
      
      return newData
    })
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
    
    // localStorageに自動保存
    if (currentStaffId) {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const key = `shift_draft_${currentStaffId}_${year}-${month}`
      localStorage.setItem(key, JSON.stringify(newShiftData))
    }
    
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
    
    // localStorageに自動保存
    if (currentStaffId) {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1
      const key = `shift_draft_${currentStaffId}_${year}-${month}`
      localStorage.setItem(key, JSON.stringify(newShiftData))
    }
    
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

