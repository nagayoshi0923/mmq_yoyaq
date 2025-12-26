import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { MonthlySalaryData, StaffSalary, ShiftDetail, GMDetail } from '../types'

/**
 * 給与データ取得フック
 */
export function useSalaryData(year: number, month: number, storeId: string) {
  const [salaryData, setSalaryData] = useState<MonthlySalaryData | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * 月の日付範囲を取得
   */
  const getMonthRange = useCallback((year: number, month: number) => {
    const startLocal = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const endLocal = new Date(year, month, 0, 23, 59, 59, 999)

    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const startStr = fmt.format(startLocal)
    const endStr = fmt.format(endLocal)

    logger.log('計算された日付範囲:', { startStr, endStr })

    return { startStr, endStr }
  }, [])

  /**
   * データ取得と集計
   */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      const { startStr, endStr } = getMonthRange(year, month)

      // スタッフデータ取得
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, name, role')
        .order('name')

      if (staffError) throw staffError

      // GMデータ取得（schedule_eventsとscenariosをJOIN）
      let gmQuery = supabase
        .from('schedule_events')
        .select(`
          id,
          date,
          store_id,
          scenario_id,
          gms,
          gm_roles,
          category,
          stores:store_id (name),
          scenarios:scenario_id (
            title,
            gm_assignments,
            duration
          )
        `)
        .gte('date', startStr)
        .lte('date', endStr)
        .eq('is_cancelled', false)

      if (storeId !== 'all') {
        gmQuery = gmQuery.eq('store_id', storeId)
      }

      const { data: gmData, error: gmError } = await gmQuery

      if (gmError) throw gmError

      logger.log('取得データ:', {
        staffData: staffData?.length,
        gmData: gmData?.length
      })

      // スタッフ別データを集計
      const staffMap = new Map<string, StaffSalary>()

      // GMデータ集計
      gmData?.forEach(event => {
        if (!event.gms || !Array.isArray(event.gms) || event.gms.length === 0) return

        const scenario = event.scenarios as unknown as { title: string; gm_assignments: any; duration: number } | null
        if (!scenario) return

        // シナリオのgm_assignmentsから報酬情報を取得
        const gmAssignments = scenario.gm_assignments || []
        
        // 時給計算（デフォルト: 5時間まで時給1750円、超過分は1000円）
        const calculateWage = (durationMinutes: number): number => {
          const roundedMinutes = Math.ceil(durationMinutes / 30) * 30
          const halfHourUnits = roundedMinutes / 30
          
          const RATE_PER_30MIN_FIRST_5H = 875
          const RATE_PER_30MIN_AFTER_5H = 500
          const THRESHOLD_UNITS = 10
          
          if (halfHourUnits <= THRESHOLD_UNITS) {
            return RATE_PER_30MIN_FIRST_5H * halfHourUnits
          } else {
            const first5Hours = RATE_PER_30MIN_FIRST_5H * THRESHOLD_UNITS
            const additionalUnits = halfHourUnits - THRESHOLD_UNITS
            const additionalPay = RATE_PER_30MIN_AFTER_5H * additionalUnits
            return first5Hours + additionalPay
          }
        }

        // GMごとに報酬を計算
        event.gms.forEach((gmName: string, index: number) => {
          const staffInfo = staffData?.find(s => s.name === gmName)
          if (!staffInfo) return

          let staff = staffMap.get(staffInfo.id)
          
          // 初期化（存在しない場合）
          if (!staff) {
            const roleArray = Array.isArray(staffInfo.role) ? staffInfo.role : []
            staff = {
              staffId: staffInfo.id,
              staffName: staffInfo.name,
              role: roleArray.join(', '),
              totalShiftHours: 0,
              totalShiftPay: 0,
              totalGMCount: 0,
              totalNormalGMCount: 0,
              totalGMTestCount: 0,
              totalGMPay: 0,
              totalNormalGMPay: 0,
              totalGMTestPay: 0,
              totalSalary: 0,
              shifts: [],
              gmAssignments: []
            }
            staffMap.set(staffInfo.id, staff)
          }

          // 報酬を計算（gm_assignmentsから取得、なければ時給計算）
          let pay = 0
          let gmRole = 'GM'
          
          // gm_rolesからロールを取得、なければインデックスで判定
          const gmRoles = event.gm_roles || {}
          const roleType = gmRoles[gmName] || (index === 0 ? 'main' : 'sub')
          
          // 受付の場合は固定2000円
          if (roleType === 'reception') {
            pay = 2000
            gmRole = '受付'
          }
          // スタッフ参加・見学の場合は給与なし
          else if (roleType === 'staff' || roleType === 'observer') {
            pay = 0
            gmRole = roleType === 'staff' ? 'スタッフ参加' : 'スタッフ見学'
          }
          // gm_assignmentsから該当する役割の報酬を検索
          else {
            const assignment = gmAssignments.find((a: any) => a.role === roleType)
            
            if (assignment && assignment.reward) {
              pay = assignment.reward
              gmRole = roleType === 'main' ? 'メインGM' : 'サブGM'
            } else {
              // 報酬が見つからない場合は時給計算
              const duration = scenario.duration || 180
              pay = calculateWage(duration)
              gmRole = 'GM（時給計算）'
            }
          }

          const isGMTest = event.category === 'gmtest'
          
          staff.totalGMCount += 1
          staff.totalGMPay += pay
          
          // GMテストと通常公演で分けて集計
          if (isGMTest) {
            staff.totalGMTestCount += 1
            staff.totalGMTestPay += pay
          } else {
            staff.totalNormalGMCount += 1
            staff.totalNormalGMPay += pay
          }

          staff.gmAssignments.push({
            date: event.date,
            scenarioTitle: scenario.title || '不明',
            storeName: (event.stores as unknown as { name: string } | null)?.name || '不明',
            gmRole,
            pay,
            isGMTest
          })
        })
      })

      // 合計給与計算
      staffMap.forEach(staff => {
        staff.totalSalary = staff.totalShiftPay + staff.totalGMPay
      })

      // データを配列に変換してソート
      const staffList = Array.from(staffMap.values())
        .filter(staff => staff.totalSalary > 0) // 給与が発生しているスタッフのみ
        .sort((a, b) => b.totalSalary - a.totalSalary)

      const totalAmount = staffList.reduce((sum, staff) => sum + staff.totalSalary, 0)
      const totalNormalPay = staffList.reduce((sum, staff) => sum + staff.totalNormalGMPay, 0)
      const totalGMTestPay = staffList.reduce((sum, staff) => sum + staff.totalGMTestPay, 0)
      const totalEventCount = staffList.reduce((sum, staff) => sum + staff.totalGMCount, 0)
      const totalNormalCount = staffList.reduce((sum, staff) => sum + staff.totalNormalGMCount, 0)
      const totalGMTestCount = staffList.reduce((sum, staff) => sum + staff.totalGMTestCount, 0)

      const monthName = `${year}年${month}月`
      setSalaryData({
        month: monthName,
        staffList,
        totalAmount,
        totalNormalPay,
        totalGMTestPay,
        totalEventCount,
        totalNormalCount,
        totalGMTestCount
      })

      logger.log('給与データ集計結果:', { staffCount: staffList.length, totalAmount })
    } catch (error) {
      logger.error('給与データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [year, month, storeId, getMonthRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    salaryData,
    loading,
    refresh: fetchData
  }
}

