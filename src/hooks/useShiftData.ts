// スタッフシフトデータの管理

import { useState, useEffect, useMemo } from 'react'
import { shiftApi } from '@/lib/shiftApi'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

export function useShiftData(
  currentDate: Date,
  staff: Staff[],
  staffLoading: boolean
) {
  const [shiftData, setShiftData] = useState<Record<string, Array<Staff & { timeSlot: string }>>>({})

  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    for (const s of staff) {
      m.set(s.id, s)
    }
    return m
  }, [staff])

  useEffect(() => {
    const loadShiftData = async () => {
      try {
        // staffが読み込まれるまで待つ
        if (staffLoading || !staff || staff.length === 0) return
        
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth() + 1
        
        // 全スタッフのシフトを取得
        const shifts = await shiftApi.getAllStaffShifts(year, month)
        
        logger.log(`📅 シフトデータ取得: ${year}年${month}月 - ${shifts.length}件`)
        
        // 日付とタイムスロットごとにスタッフを整理
        const shiftMap: Record<string, Array<Staff & { timeSlot: string }>> = {}
        
        // マッチングできなかったstaff_idを追跡
        const unmatchedStaffIds = new Set<string>()
        
        for (const shift of shifts) {
          // staffステートから完全なスタッフデータ（special_scenariosを含む）を取得
          const fullStaffData = staffById.get(shift.staff_id)
          if (!fullStaffData) {
            unmatchedStaffIds.add(shift.staff_id)
            continue
          }
          
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
        
        // マッチングできなかったstaff_idをログ出力
        if (unmatchedStaffIds.size > 0) {
          logger.log(`⚠️ スタッフテーブルに存在しないstaff_id: ${unmatchedStaffIds.size}件`, Array.from(unmatchedStaffIds))
        }
        
        // シフトデータのサマリーをログ出力
        const uniqueStaffInShifts = new Set<string>()
        Object.values(shiftMap).forEach(staffList => {
          staffList.forEach(s => uniqueStaffInShifts.add(s.name))
        })
        logger.log(`📊 シフトマップ作成完了: ${Object.keys(shiftMap).length}スロット, ${uniqueStaffInShifts.size}名のスタッフ`, Array.from(uniqueStaffInShifts))
        
        setShiftData(shiftMap)
      } catch (error) {
        logger.error('Error loading shift data:', error)
      }
    }
    
    loadShiftData()
  }, [currentDate, staff, staffLoading, staffById])

  return { shiftData }
}

