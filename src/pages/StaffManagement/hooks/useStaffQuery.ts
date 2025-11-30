import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '@/lib/api'
import { assignmentApi } from '@/lib/assignmentApi'
import type { Staff } from '@/types'
import { logger } from '@/utils/logger'

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
      const assignmentMap = await assignmentApi.getBatchStaffAssignments(staffIds).catch((error) => {
        logger.error('Error loading batch staff assignments:', error)
        return new Map<string, { gmScenarios: string[], experiencedScenarios: string[] }>()
      })
      
      // スタッフデータにアサインメント情報をマージ
      const staffWithAssignments = staffData.map(staff => {
        const assignments = assignmentMap.get(staff.id) || { gmScenarios: [], experiencedScenarios: [] }
        return {
          ...staff,
          special_scenarios: assignments.gmScenarios,
          experienced_scenarios: assignments.experiencedScenarios
        }
      })
      
      return staffWithAssignments
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useStaffMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ staff, isEdit }: { staff: Staff; isEdit: boolean }) => {
      let result: Staff
      if (isEdit) {
        result = await staffApi.update(staff.id, staff)
        
        // staff_scenario_assignmentsテーブルも同期更新
        // special_scenariosが変更された場合、リレーションテーブルを更新
        if (staff.special_scenarios) {
          await assignmentApi.updateStaffAssignments(staff.id, staff.special_scenarios)
        }
      } else {
        result = await staffApi.create(staff)
        
        // 新規作成時もリレーションテーブルに追加
        if (staff.special_scenarios && staff.special_scenarios.length > 0 && result.id) {
          await assignmentApi.updateStaffAssignments(result.id, staff.special_scenarios)
        }
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
      queryClient.invalidateQueries({ queryKey: staffKeys.all })
    },
  })
}

export function useDeleteStaffMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (staffId: string) => staffApi.delete(staffId),
    onMutate: async (staffId) => {
      await queryClient.cancelQueries({ queryKey: staffKeys.all })
      const previous = queryClient.getQueryData<Staff[]>(staffKeys.all)
      
      queryClient.setQueryData<Staff[]>(staffKeys.all, (old = []) => {
        return old.filter(s => s.id !== staffId)
      })
      
      return { previous }
    },
    onError: (err, staffId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(staffKeys.all, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: staffKeys.all })
    },
  })
}

