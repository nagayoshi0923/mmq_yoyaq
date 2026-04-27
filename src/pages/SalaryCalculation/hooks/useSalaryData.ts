import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { fetchSalarySettings, calculateGmWage, type SalarySettings } from '@/hooks/useSalarySettings'
import type { MonthlySalaryData, StaffSalary, ShiftDetail, GMDetail } from '../types'

/**
 * 給与データ取得フック
 */
export function useSalaryData(year: number, month: number, storeIds: string[]) {
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

      // 給与設定を取得
      const salarySettings = await fetchSalarySettings()

      // 組織IDを取得
      const orgId = await getCurrentOrganizationId()

      // スタッフデータ取得（組織対応）
      let staffQuery = supabase
        .from('staff')
        .select('id, name, role')
      
      if (orgId) {
        staffQuery = staffQuery.eq('organization_id', orgId)
      }
      
      const { data: staffData, error: staffError } = await staffQuery.order('name')

      if (staffError) throw staffError

      // GMデータ取得（schedule_eventsとscenariosをJOIN）
      let gmQuery = supabase
        .from('schedule_events_staff_view')
        .select(`
          id,
          date,
          store_id,
          scenario_master_id,
          gms,
          gm_roles,
          category,
          is_cancelled,
          stores:store_id (name),
          scenario_masters:scenario_master_id (
            title,
            official_duration
          )
        `)
        .gte('date', startStr)
        .lte('date', endStr)

      if (storeIds.length > 0) {
        gmQuery = gmQuery.in('store_id', storeIds)
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

        const scenario = event.scenario_masters as unknown as { title: string; official_duration: number } | null
        if (!scenario) return

        // シナリオのgm_assignmentsから報酬情報を取得（organization_scenariosから取得する必要がある場合は別途対応）
        const gmAssignments: any[] = []
        const isGMTest = event.category === 'gmtest'
        const isCancelled = event.is_cancelled === true

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

          // 役割を特定（中止でも表示用に算出）
          let pay = 0
          let gmRole = 'GM'

          // gm_rolesからロールを取得、なければインデックスで判定
          const gmRoles = event.gm_roles || {}
          const roleType = gmRoles[gmName] || (index === 0 ? 'main' : 'sub')

          if (roleType === 'reception') {
            gmRole = '受付'
          } else if (roleType === 'staff' || roleType === 'observer') {
            gmRole = roleType === 'staff' ? 'スタッフ参加' : 'スタッフ見学'
          } else {
            gmRole = roleType === 'main' ? 'メインGM' : 'サブGM'
          }

          // 中止公演は給与0で記録のみ（合計に加算しない）
          if (isCancelled) {
            staff.gmAssignments.push({
              date: event.date,
              scenarioTitle: scenario.title || '不明',
              storeName: (event.stores as unknown as { name: string } | null)?.name || '不明',
              gmRole,
              pay: 0,
              isGMTest,
              isCancelled: true
            })
            return
          }

          // 報酬を計算（gm_assignmentsから取得、なければ時給計算）
          if (roleType === 'reception') {
            pay = salarySettings.reception_fixed_pay
          } else if (roleType === 'staff' || roleType === 'observer') {
            pay = 0
          } else {
            const assignment = gmAssignments.find((a: any) => a.role === roleType)
            if (assignment && assignment.reward) {
              pay = assignment.reward
            } else {
              const duration = scenario.official_duration || 180
              pay = calculateGmWage(duration, isGMTest, salarySettings)
              gmRole = isGMTest ? 'GM（GMテスト）' : 'GM（時給計算）'
            }
          }

          staff.totalGMCount += 1
          staff.totalGMPay += pay

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
            isGMTest,
            isCancelled: false
          })
        })
      })

      // 合計給与計算
      staffMap.forEach(staff => {
        staff.totalSalary = staff.totalShiftPay + staff.totalGMPay
      })

      // データを配列に変換してソート（中止のみのスタッフも表示）
      const staffList = Array.from(staffMap.values())
        .filter(staff => staff.gmAssignments.length > 0)
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
  }, [year, month, storeIds, getMonthRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    salaryData,
    loading,
    refresh: fetchData
  }
}

