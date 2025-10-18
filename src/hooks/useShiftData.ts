// スタッフシフトデータの管理

import { useState, useEffect } from 'react'
import { shiftApi } from '@/lib/shiftApi'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

export function useShiftData(
  currentDate: Date,
  staff: Staff[],
  staffLoading: boolean
) {
  const [shiftData, setShiftData] = useState<Record<string, Array<Staff & { timeSlot: string }>>>({})

  useEffect(() => {
    const loadShiftData = async () => {
      try {
        // staffが読み込まれるまで待つ
        if (staffLoading || !staff || staff.length === 0) return
        
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        // 全スタッフのシフトを取得
        const shifts = await shiftApi.getAllStaffShifts(year, month)
        
        // 日付とタイムスロットごとにスタッフを整理
        const shiftMap: Record<string, Array<Staff & { timeSlot: string }>> = {}
        
        for (const shift of shifts) {
          const shiftStaff = (shift as any).staff
          if (!shiftStaff) continue
          
          // staffステートから完全なスタッフデータ（special_scenariosを含む）を取得
          const fullStaffData = staff.find(s => s.id === shiftStaff.id)
          if (!fullStaffData) continue
          
          const dateKey = shift.date
          
          // 各タイムスロットをチェック
          if (shift.morning || shift.all_day) {
            const key = `${dateKey}-morning`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'morning' })
          }
          
          if (shift.afternoon || shift.all_day) {
            const key = `${dateKey}-afternoon`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'afternoon' })
          }
          
          if (shift.evening || shift.all_day) {
            const key = `${dateKey}-evening`
            if (!shiftMap[key]) shiftMap[key] = []
            shiftMap[key].push({ ...fullStaffData, timeSlot: 'evening' })
          }
        }
        
        setShiftData(shiftMap)
      } catch (error) {
        logger.error('Error loading shift data:', error)
      }
    }
    
    loadShiftData()
  }, [currentDate, staff, staffLoading])

  return { shiftData }
}

