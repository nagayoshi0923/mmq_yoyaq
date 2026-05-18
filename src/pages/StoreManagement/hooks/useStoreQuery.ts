import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storeApi } from '@/lib/api'
import type { Store } from '@/types'

export const storeKeys = {
  all: ['store-management'] as const,
}

export function useStoreQuery() {
  return useQuery({
    queryKey: storeKeys.all,
    queryFn: () => storeApi.getAll(),
  })
}

export function useStoreQueryClient() {
  const queryClient = useQueryClient()

  const updateStore = (updated: Store) => {
    queryClient.setQueryData<Store[]>(storeKeys.all, old =>
      old ? old.map(s => s.id === updated.id ? updated : s) : [updated]
    )
  }

  const addStore = (newStore: Store) => {
    queryClient.setQueryData<Store[]>(storeKeys.all, old =>
      old ? [...old, newStore] : [newStore]
    )
  }

  const removeStore = (id: string) => {
    queryClient.setQueryData<Store[]>(storeKeys.all, old =>
      old ? old.filter(s => s.id !== id) : []
    )
  }

  return { updateStore, addStore, removeStore }
}
