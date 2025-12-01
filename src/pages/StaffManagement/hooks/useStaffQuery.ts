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
      const staffData = staff as Staff & { experienced_scenarios?: string[] }
      
      if (isEdit) {
        result = await staffApi.update(staff.id, staff)
        
        // staff_scenario_assignmentsテーブルを同期更新
        // 担当シナリオ（GM可能）と体験済みシナリオを統合して保存
        const gmScenarios = staffData.special_scenarios || []
        const expScenarios = staffData.experienced_scenarios || []
        
        // アサインメントオブジェクトを構築
        // GM可能シナリオ: can_main_gm=true, can_sub_gm=true, is_experienced=true
        // 体験のみシナリオ: can_main_gm=false, can_sub_gm=false, is_experienced=true
        const assignments: Array<{
          scenarioId: string
          can_main_gm: boolean
          can_sub_gm: boolean
          is_experienced: boolean
        }> = []
        
        // GM可能シナリオを追加（体験済みも含む）
        gmScenarios.forEach(scenarioId => {
          assignments.push({
            scenarioId,
            can_main_gm: true,
            can_sub_gm: true,
            is_experienced: true
          })
        })
        
        // 体験のみシナリオを追加（GM可能に含まれないもの）
        expScenarios.forEach(scenarioId => {
          if (!gmScenarios.includes(scenarioId)) {
            assignments.push({
              scenarioId,
              can_main_gm: false,
              can_sub_gm: false,
              is_experienced: true
            })
          }
        })
        
        if (assignments.length > 0 || gmScenarios.length === 0) {
          await assignmentApi.updateStaffAssignments(staff.id, assignments)
        }
      } else {
        result = await staffApi.create(staff)
        
        // 新規作成時もリレーションテーブルに追加
        const gmScenarios = staffData.special_scenarios || []
        const expScenarios = staffData.experienced_scenarios || []
        
        const assignments: Array<{
          scenarioId: string
          can_main_gm: boolean
          can_sub_gm: boolean
          is_experienced: boolean
        }> = []
        
        gmScenarios.forEach(scenarioId => {
          assignments.push({
            scenarioId,
            can_main_gm: true,
            can_sub_gm: true,
            is_experienced: true
          })
        })
        
        expScenarios.forEach(scenarioId => {
          if (!gmScenarios.includes(scenarioId)) {
            assignments.push({
              scenarioId,
              can_main_gm: false,
              can_sub_gm: false,
              is_experienced: true
            })
      }
        })
        
        if (assignments.length > 0 && result.id) {
          await assignmentApi.updateStaffAssignments(result.id, assignments)
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

