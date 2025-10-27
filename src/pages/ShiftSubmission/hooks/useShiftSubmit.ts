import { logger } from '@/utils/logger'
import { shiftApi } from '@/lib/shiftApi'
import { supabase } from '@/lib/supabase'
import type { ShiftSubmission } from '../types'

interface UseShiftSubmitProps {
  currentStaffId: string
  shiftData: Record<string, ShiftSubmission>
  setLoading: (loading: boolean) => void
}

/**
 * シフト送信処理フック
 */
export function useShiftSubmit({ currentStaffId, shiftData, setLoading }: UseShiftSubmitProps) {
  
  /**
   * シフト提出
   */
  const handleSubmitShift = async () => {
    if (!currentStaffId) {
      alert('スタッフ情報が取得できませんでした')
      return
    }
    
    setLoading(true)
    try {
      // 全てのシフトデータを処理（選択なしの場合は削除扱い）
      const allShifts = Object.values(shiftData)
      
      // チェックありのシフト
      const shiftsToSave = allShifts.filter(shift => 
        shift.morning || shift.afternoon || shift.evening || shift.all_day
      )
      
      // チェックなしのシフト（削除対象）
      const shiftsToDelete = allShifts.filter(shift => 
        !shift.morning && !shift.afternoon && !shift.evening && !shift.all_day
      )
      
      // 保存用データ準備
      const shiftsToUpsert = shiftsToSave.map(shift => ({
        staff_id: currentStaffId,
        date: shift.date,
        morning: shift.morning,
        afternoon: shift.afternoon,
        evening: shift.evening,
        all_day: shift.all_day,
        status: 'submitted' as const,
        submitted_at: new Date().toISOString()
      }))
      
      // 削除用データ準備（全てfalseで保存）
      const shiftsToRemove = shiftsToDelete.map(shift => ({
        staff_id: currentStaffId,
        date: shift.date,
        morning: false,
        afternoon: false,
        evening: false,
        all_day: false,
        status: 'submitted' as const,
        submitted_at: new Date().toISOString()
      }))
      
      // 全てのデータを送信（チェックあり + チェックなし）
      const allShiftsToSubmit = [...shiftsToUpsert, ...shiftsToRemove]
      
      if (allShiftsToSubmit.length > 0) {
        await shiftApi.upsertStaffShifts(allShiftsToSubmit)
      }
      
      logger.log('シフト提出成功:', { 保存: shiftsToUpsert.length, 削除: shiftsToRemove.length })
      
      // Discord通知を送信
      try {
        // 年月を取得（最初のシフトから）
        const firstShift = shiftsToSave[0] || shiftsToDelete[0]
        if (firstShift) {
          const date = new Date(firstShift.date)
          const year = date.getFullYear()
          const month = date.getMonth() + 1
          
          await supabase.functions.invoke('notify-shift-submitted-discord', {
            body: {
              staff_id: currentStaffId,
              year,
              month,
              shifts: shiftsToSave.map(shift => ({
                date: shift.date,
                morning: shift.morning,
                afternoon: shift.afternoon,
                evening: shift.evening,
                all_day: shift.all_day
              }))
            }
          })
          
          logger.log('Discord通知送信成功')
        }
      } catch (notifyError) {
        // 通知エラーは無視（本体処理は成功）
        logger.error('Discord通知エラー（処理は継続）:', notifyError)
      }
      
      const totalUpdated = shiftsToUpsert.length + shiftsToRemove.length
      alert(`シフトを更新しました。\n\n${totalUpdated}日分のシフトを更新しました。\n\nスケジュール管理ページで確認できます。`)
      
    } catch (error) {
      logger.error('シフト提出エラー:', error)
      alert('シフトの更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return {
    handleSubmitShift
  }
}

