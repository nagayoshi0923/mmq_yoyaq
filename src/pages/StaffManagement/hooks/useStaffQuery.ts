import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '@/lib/api'
import { fetchStaffWithAssignments } from '@/lib/staffAssignmentsQuery'
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
    queryFn: fetchStaffWithAssignments,
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
      const row = staffRowWithoutAssignments(staff)
      const payload = edit && (isEdit || edit.records.length > 0)
        ? { ...row, assignment_edit: edit, confirm_clear: confirmDecrease === true }
        : row
      return isEdit
        ? await staffApi.update(staff.id, payload)
        : await staffApi.create({ ...payload, special_scenarios: [], available_scenarios: [] })
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
