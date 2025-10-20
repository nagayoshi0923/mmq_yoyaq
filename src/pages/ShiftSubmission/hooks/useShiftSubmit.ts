import { logger } from '@/utils/logger'
import { shiftApi } from '@/lib/shiftApi'
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
      alert(`シフトを更新しました。\n\n保存: ${shiftsToUpsert.length}件\n削除: ${shiftsToRemove.length}件\n\nスケジュール管理ページで確認できます。`)
      
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

