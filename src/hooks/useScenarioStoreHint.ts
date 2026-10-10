import { useEffect, useState } from 'react'
import { logger } from '@/utils/logger'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { playableStoresForScenario, scenarioStoreHintText } from '@/lib/scenarioStoreHint'

/** 希望店舗と作品の上演可能店舗が食い違うときの注意文（無ければ null） */
export function useScenarioStoreHint(organizationId: string | null | undefined, scenarioMasterId: string | null | undefined, preferredStoreIds: string[]): string | null {
  const [hint, setHint] = useState<string | null>(null)
  const preferredKey = [...preferredStoreIds].sort().join(',')

  useEffect(() => {
    if (!organizationId || !scenarioMasterId || !preferredKey) {
      setHint(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [scenarioRes, storesRes] = await Promise.all([
          privateGroupPageReadApi.findScenarioAvailableStores(scenarioMasterId, organizationId),
          privateGroupPageReadApi.listActiveStoresOfOrganization(organizationId),
        ])
        if (scenarioRes.error) throw scenarioRes.error
        if (storesRes.error) throw storesRes.error
        const stores = storesRes.data ?? []
        const playable = playableStoresForScenario(stores, scenarioRes.data?.available_stores)
        if (!cancelled) setHint(scenarioStoreHintText(playable, preferredKey.split(','), stores))
      } catch (err) {
        logger.error('Failed to load scenario store hint', err)
        if (!cancelled) setHint(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId, scenarioMasterId, preferredKey])

  return hint
}
