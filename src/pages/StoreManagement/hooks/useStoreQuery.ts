import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storeApi } from '@/lib/api'
import type { Store, StoreTravelTime } from '@/types'

export const storeKeys = {
  all: ['store-management'] as const,
  travelTimes: ['store-management', 'travel-times'] as const,
}

export function useStoreQuery() {
  return useQuery({
    queryKey: storeKeys.all,
    queryFn: () => storeApi.getAll(),
  })
}

export function useStoreTravelTimesQuery() {
  return useQuery({
    queryKey: storeKeys.travelTimes,
    queryFn: () => storeApi.getTravelTimes(),
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

  const updateTravelTimes = (travelTimes: StoreTravelTime[]) => {
    queryClient.setQueryData<StoreTravelTime[]>(storeKeys.travelTimes, travelTimes)
  }

  return { updateStore, addStore, removeStore, updateTravelTimes }
}
