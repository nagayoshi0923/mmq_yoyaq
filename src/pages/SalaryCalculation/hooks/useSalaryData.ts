import { useQuery } from '@tanstack/react-query'
import { salaryReportApi } from '@/lib/api/salaryReportApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { useSalaryOrganization } from '@/hooks/useSalaryOrganization'
import { logger } from '@/utils/logger'
import { fetchSalarySettingsForPeriod, calculateGmWage } from '@/hooks/useSalarySettings'
import type { MonthlySalaryData, StaffSalary, UnresolvedSalaryEvent, UnresolvedSalaryStaff } from '../types'

// シナリオ不要カテゴリ（出張・場所貸し・MTG）。これらはマスタ未解決でも警告対象にしない
const NON_SCENARIO_CATEGORIES = ['offsite', 'venue_rental', 'venue_rental_free', 'mtg']
const normalizeScenarioTitle = (s: string) => (s || '').replace(/[\s\-・／/]/g, '').toLowerCase()

function getMonthRange(year: number, month: number) {
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { startStr, endStr: `${year}-${String(month).padStart(2, '0')}-${lastDay}` }
}

export async function fetchSalaryData(year: number, month: number, storeIds: string[], expectedOrgId?: string): Promise<MonthlySalaryData> {
  const { startStr, endStr } = getMonthRange(year, month)
  logger.log('計算された日付範囲:', { startStr, endStr })

  const orgId = await getCurrentOrganizationId()
  if (!orgId || (expectedOrgId && orgId !== expectedOrgId)) throw new Error('組織を確認できないため給与を計算できません。再読み込みしてください。')
  const settingsForDate = await fetchSalarySettingsForPeriod(startStr, endStr, orgId)

  const { staff: staffData, events } = await salaryReportApi.salaryInputs(startStr, endStr, orgId)
  const gmData = storeIds.length ? events.filter(event => storeIds.includes(event.store_id)) : events

  logger.log('取得データ:', { staffData: staffData?.length, gmData: gmData?.length })

  const staffMap = new Map<string, StaffSalary>()
  const staffById = new Map(staffData.map(staff => [staff.id, staff]))

  // フォールバック用: 同月内で scenario_master が解決済みの公演から「タイトル→マスタ情報」を学習。
  // scenario_master_id が未設定（貸切作成時に付与漏れ等）でも、同名公演がマスタ解決できていれば集計に拾う。
  const scenarioByTitle = new Map<string, { title: string; official_duration: number }>()
  gmData?.forEach(event => {
    const sc = event.scenario_masters as unknown as { title: string; official_duration: number } | null
    if (sc && event.scenario) {
      const key = normalizeScenarioTitle(event.scenario)
      if (!scenarioByTitle.has(key)) scenarioByTitle.set(key, sc)
    }
  })

  // タイトル解決もできず集計対象外になった公演（GMあり・非シナリオcat除く）を記録し、画面で警告表示する
  const unresolvedEvents: UnresolvedSalaryEvent[] = []
  const unresolvedStaff: UnresolvedSalaryStaff[] = []

  gmData?.forEach(event => {
    if (!event.gms || !Array.isArray(event.gms) || event.gms.length === 0) return
    if (!Array.isArray(event.staff_assignments) || event.staff_assignments.length !== event.gms.length) {
      throw new Error('公演の担当者データが一致しないため給与を計算できません。再読み込みしてください。')
    }
    let scenario = event.scenario_masters as unknown as { title: string; official_duration: number } | null
    // scenario_master_id 未設定/解決不可でも、フリーテキストの scenario からタイトル解決して集計する
    // （これが無いと「スケジュールにあるのに給与に出ない」公演がサイレントに漏れる）
    if (!scenario && event.scenario) {
      const fallback = scenarioByTitle.get(normalizeScenarioTitle(event.scenario))
      if (fallback) scenario = fallback
    }
    if (!scenario) {
      // 出張・場所貸し・MTG 等の非シナリオ公演は対象外。それ以外でGM付きなのに解決できないものは
      // サイレントに捨てず警告対象として可視化する
      if (!NON_SCENARIO_CATEGORIES.includes(event.category)) {
        unresolvedEvents.push({ date: event.date, scenario: event.scenario || '(無題)', gmCount: event.gms.length })
      }
      return
    }

    const isGMTest = event.category === 'gmtest'
    const isCancelled = event.is_cancelled === true

    event.staff_assignments.forEach(assignment => {
      const staffInfo = assignment.staff_id ? staffById.get(assignment.staff_id) : undefined
      if (assignment.resolution_status !== 'resolved' || !staffInfo || assignment.role_confirmed !== true) {
        unresolvedStaff.push({ eventId: event.id, date: event.date, scenario: scenario.title || event.scenario || '(無題)',
          staffName: assignment.staff_name || '(名前なし)', reason: assignment.resolution_status === 'duplicate' ? 'duplicate' : !staffInfo ? 'unmatched' : 'role_unconfirmed' })
        return
      }

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

      const roleType = assignment.role

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
        pay = settingsForDate(event.date).reception_fixed_pay
      } else if (roleType === 'staff' || roleType === 'observer') {
        pay = 0
      } else {
        const duration = scenario.official_duration || 180
        pay = calculateGmWage(duration, isGMTest, settingsForDate(event.date))
        gmRole = isGMTest ? 'GM（GMテスト）' : 'GM（時給計算）'
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

  if (unresolvedEvents.length > 0) {
    logger.warn('給与集計: シナリオ未解決で対象外の公演あり', { count: unresolvedEvents.length, unresolvedEvents })
  }
  logger.log('給与データ集計結果:', { staffCount: staffList.length, totalAmount })

  return {
    month: `${year}年${month}月`,
    staffList,
    totalAmount,
    totalNormalPay,
    totalGMTestPay,
    totalEventCount,
    totalNormalCount,
    totalGMTestCount,
    unresolvedEvents,
    unresolvedStaff
  }
}

/**
 * 給与データ取得フック
 */
export function useSalaryData(year: number, month: number, storeIds: string[]) {
  const { organizationId, isLoading: organizationLoading, error: organizationError } = useSalaryOrganization()
  const query = useQuery({
    queryKey: ['salary-data', organizationId, year, month, storeIds],
    queryFn: () => fetchSalaryData(year, month, storeIds, organizationId!),
    enabled: !!organizationId && year > 0 && month > 0,
    retry: false,
  })

  const error = organizationError ?? query.error ?? (!organizationLoading && !organizationId ? new Error('組織を確認できません。再ログインしてください。') : null)
  return {
    salaryData: error ? null : query.data ?? null,
    error,
    loading: organizationLoading || query.isLoading,
    refresh: query.refetch,
  }
}
