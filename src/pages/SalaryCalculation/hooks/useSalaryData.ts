import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { fetchSalarySettings, calculateGmWage, type SalarySettings } from '@/hooks/useSalarySettings'
import type { MonthlySalaryData, StaffSalary, ShiftDetail, GMDetail } from '../types'

function getMonthRange(year: number, month: number) {
  const startLocal = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const endLocal = new Date(year, month, 0, 23, 59, 59, 999)

  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return { startStr: fmt.format(startLocal), endStr: fmt.format(endLocal) }
}

async function fetchSalaryData(year: number, month: number, storeIds: string[]): Promise<MonthlySalaryData> {
  const { startStr, endStr } = getMonthRange(year, month)
  logger.log('計算された日付範囲:', { startStr, endStr })

  const salarySettings = await fetchSalarySettings()
  const orgId = await getCurrentOrganizationId()

  let staffQuery = supabase.from('staff').select('id, name, role')
  if (orgId) staffQuery = staffQuery.eq('organization_id', orgId)
  const { data: staffData, error: staffError } = await staffQuery.order('name')
  if (staffError) throw staffError

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

  if (storeIds.length > 0) gmQuery = gmQuery.in('store_id', storeIds)
  const { data: gmData, error: gmError } = await gmQuery
  if (gmError) throw gmError

  logger.log('取得データ:', { staffData: staffData?.length, gmData: gmData?.length })

  const staffMap = new Map<string, StaffSalary>()

  gmData?.forEach(event => {
    if (!event.gms || !Array.isArray(event.gms) || event.gms.length === 0) return
    const scenario = event.scenario_masters as unknown as { title: string; official_duration: number } | null
    if (!scenario) return

    const gmAssignments: any[] = []
    const isGMTest = event.category === 'gmtest'
    const isCancelled = event.is_cancelled === true

    event.gms.forEach((gmName: string, index: number) => {
      const staffInfo = staffData?.find(s => s.name === gmName)
      if (!staffInfo) return

      let staff = staffMap.get(staffInfo.id)
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

      let pay = 0
      let gmRole = 'GM'

      const gmRoles = event.gm_roles || {}
      const roleType = gmRoles[gmName] || (index === 0 ? 'main' : 'sub')

      if (roleType === 'reception') {
        gmRole = '受付'
      } else if (roleType === 'staff' || roleType === 'observer') {
        gmRole = roleType === 'staff' ? 'スタッフ参加' : 'スタッフ見学'
      } else {
        gmRole = roleType === 'main' ? 'メインGM' : 'サブGM'
      }

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

  staffMap.forEach(staff => {
    staff.totalSalary = staff.totalShiftPay + staff.totalGMPay
  })

  const staffList = Array.from(staffMap.values())
    .filter(staff => staff.gmAssignments.length > 0)
    .sort((a, b) => b.totalSalary - a.totalSalary)

  const totalAmount = staffList.reduce((sum, s) => sum + s.totalSalary, 0)
  const totalNormalPay = staffList.reduce((sum, s) => sum + s.totalNormalGMPay, 0)
  const totalGMTestPay = staffList.reduce((sum, s) => sum + s.totalGMTestPay, 0)
  const totalEventCount = staffList.reduce((sum, s) => sum + s.totalGMCount, 0)
  const totalNormalCount = staffList.reduce((sum, s) => sum + s.totalNormalGMCount, 0)
  const totalGMTestCount = staffList.reduce((sum, s) => sum + s.totalGMTestCount, 0)

  logger.log('給与データ集計結果:', { staffCount: staffList.length, totalAmount })

  return {
    month: `${year}年${month}月`,
    staffList,
    totalAmount,
    totalNormalPay,
    totalGMTestPay,
    totalEventCount,
    totalNormalCount,
    totalGMTestCount
  }
}

/**
 * 給与データ取得フック
 */
export function useSalaryData(year: number, month: number, storeIds: string[]) {
  const query = useQuery({
    queryKey: ['salary-data', year, month, storeIds],
    queryFn: () => fetchSalaryData(year, month, storeIds),
    enabled: year > 0 && month > 0,
  })

  return {
    salaryData: query.data ?? null,
    loading: query.isLoading,
    refresh: query.refetch,
  }
}
