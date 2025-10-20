import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { staffApi } from '@/lib/api'
import type { Staff } from '@/types'

export const staffKeys = {
  all: ['staff'] as const,
}

export function useStaffQuery() {
  return useQuery({
    queryKey: staffKeys.all,
    queryFn: () => staffApi.getAll(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useStaffMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ staff, isEdit }: { staff: Staff; isEdit: boolean }) => {
      if (isEdit) {
        return await staffApi.update(staff.id, staff)
      } else {
        return await staffApi.create(staff)
      }
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

