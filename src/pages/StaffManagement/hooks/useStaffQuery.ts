import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import { invalidateAssignmentQueries } from '@/lib/queryInvalidation'
import type { Staff } from '@/types'
import type { StaffEditData } from '@/lib/staffAssignmentEdit'

/** staff 行に書いてはいけない担当カラム。正本は staff_scenario_assignments。 */
function staffRowWithoutAssignments(staff: Staff) {
  const {
    assignment_edit: _edit,
    gm_scenario_modes: _modes,
    special_scenarios: _special,
    available_scenarios: _available,
    experienced_scenarios: _experienced,
    ...row
  } = staff as StaffEditData & { experienced_scenarios?: string[]; available_scenarios?: string[] }
  return row
}

export const staffKeys = {
  all: ['staff'] as const,
}

export function useStaffQuery() {
  return useQuery({
    queryKey: staffKeys.all,
    queryFn: async () => {
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
    },
    staleTime: 30 * 1000, // 30秒間キャッシュ
  })
}

export function useStaffMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      staff,
      isEdit,
      confirmDecrease,
    }: {
      staff: Staff
      isEdit: boolean
      // 担当減少ガード（YOYAQ-011）を明示承認して再送するとき true
      confirmDecrease?: boolean
    }) => {
      const edit = (staff as StaffEditData).assignment_edit
      // 担当タブを変更した保存だけ担当APIを呼ぶ。基本情報の保存で担当を再構築しない。
      if (isEdit && edit) {
        await assignmentApi.updateStaffAssignments(staff.id, edit.records, undefined, {
          confirmClear: confirmDecrease === true,
          expectedAssignments: edit.baseline,
        })
      }
      const result = isEdit
        ? await staffApi.update(staff.id, staffRowWithoutAssignments(staff))
        : await staffApi.create({ ...staffRowWithoutAssignments(staff), special_scenarios: [], available_scenarios: [] })
      if (!isEdit && edit && edit.records.length > 0) {
        await assignmentApi.updateStaffAssignments(result.id, edit.records, undefined, {
          expectedAssignments: [],
        })
      }
      return result
    },
    onMutate: async ({ staff, isEdit }) => {
      await queryClient.cancelQueries({ queryKey: staffKeys.all })
      const previous = queryClient.getQueryData<Staff[]>(staffKeys.all)
      
      queryClient.setQueryData<Staff[]>(staffKeys.all, (old = []) => {
        if (isEdit) {
          return old.map(s => s.id === staff.id ? staff : s)
        } else {
          return [{ ...staff, id: `temp-${Date.now()}` }, ...old]
        }
      })
      
      return { previous }
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(staffKeys.all, context.previous)
      }
    },
    onSettled: () => {
      void invalidateAssignmentQueries(queryClient)
    },
  })
}
