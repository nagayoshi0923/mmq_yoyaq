import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'

// 通常表示と先読みで同じ正本・同じエラー処理を使う。
export async function fetchStaffWithAssignments() {
  // スタッフデータを取得
  const staffData = await staffApi.getAll()

  // 担当シナリオ情報を一括取得（N+1問題の回避）
  const staffIds = staffData.map(s => s.id)
  const assignmentMap = await assignmentApi.getBatchStaffAssignments(staffIds)

  const emptyAssignments = {
    gmScenarios: [] as string[],
    experiencedScenarios: [] as string[],
    gm_scenario_modes: {} as Record<string, 'main_only' | 'sub_only' | 'main_and_sub'>,
  }

  // スタッフデータにアサインメント情報をマージ
  const staffWithAssignments = staffData.map((staff) => {
    const assignments = assignmentMap.get(staff.id) || emptyAssignments
    return {
      ...staff,
      special_scenarios: assignments.gmScenarios,
      experienced_scenarios: assignments.experiencedScenarios,
      gm_scenario_modes: assignments.gm_scenario_modes,
    }
  })

  return staffWithAssignments
}
