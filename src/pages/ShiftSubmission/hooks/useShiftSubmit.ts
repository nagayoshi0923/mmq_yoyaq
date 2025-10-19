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
      // シフトデータを配列に変換して保存
      const shiftsToSave = Object.values(shiftData).filter(shift => 
        shift.morning || shift.afternoon || shift.evening || shift.all_day
      )
      
      if (shiftsToSave.length === 0) {
        alert('シフトが選択されていません')
        setLoading(false)
        return
      }
      
      // シフトデータを準備（upsert用）
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
      
      // データベースに保存（upsert）
      await shiftApi.upsertStaffShifts(shiftsToUpsert)
      
      logger.log('シフト提出成功:', shiftsToUpsert)
      alert('シフトを提出しました')
      
    } catch (error) {
      logger.error('シフト提出エラー:', error)
      alert('シフトの提出に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return {
    handleSubmitShift
  }
}

