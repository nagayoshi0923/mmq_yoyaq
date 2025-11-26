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
      
      // localStorageの下書きを削除
      const firstShift = shiftsToSave[0] || shiftsToDelete[0]
      if (firstShift) {
        const date = new Date(firstShift.date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const draftKey = `shift_draft_${currentStaffId}_${year}-${month}`
        localStorage.removeItem(draftKey)
        logger.log('下書きデータを削除:', draftKey)
      }
      
      // Discord通知とGoogleスプレッドシート同期をバックグラウンドで実行（結果を待たない）
      if (firstShift) {
        const date = new Date(firstShift.date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        
        // バックグラウンド実行（awaitしない）
        Promise.allSettled([
          // Discord通知
          supabase.functions.invoke('notify-shift-submitted-discord', {
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
          }),
          // Googleスプレッドシート同期（DB準拠：全スタッフ）
          supabase.functions.invoke('sync-shifts-to-google-sheet', {
            body: {
              year,
              month
            }
          })
        ]).then(results => {
          // 結果をログ出力（成功/失敗を記録）
          results.forEach((result, index) => {
            const taskName = index === 0 ? 'Discord通知' : 'スプレッドシート同期'
            if (result.status === 'rejected') {
              console.error(`❌ ${taskName} エラー:`, result.reason)
            } else if (result.value?.error) {
              console.error(`❌ ${taskName} エラー:`, result.value.error)
            } else {
              console.log(`✅ ${taskName} 成功`)
            }
          })
          logger.log('バックグラウンド処理完了（通知・同期）')
        }).catch(error => {
          // エラーは無視（本体処理は成功しているため）
          logger.error('バックグラウンド処理エラー（処理は継続）:', error)
        })
      }
      
      // チェックボックスの総数を計算（終日は3枠としてカウント）
      const totalCheckedSlots = shiftsToSave.reduce((count, shift) => {
        // 終日の場合は3枠（朝・昼・夜）としてカウント
        if (shift.all_day) {
          return count + 3
        }
        
        let slotCount = 0
        if (shift.morning) slotCount++
        if (shift.afternoon) slotCount++
        if (shift.evening) slotCount++
        return count + slotCount
      }, 0)
      
      // 提出月を取得
      const displayShift = shiftsToSave[0] || shiftsToDelete[0]
      let monthDisplay = ''
      if (displayShift) {
        const date = new Date(displayShift.date)
        const month = date.getMonth() + 1
        monthDisplay = `${month}月分の`
      }
      
      const totalDays = shiftsToUpsert.length + shiftsToRemove.length
      alert(`シフトを更新しました。\n\n${monthDisplay}シフトを更新しました。\n（出勤可能: ${totalCheckedSlots}枠）\n\nスケジュール管理ページで確認できます。`)
      
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

