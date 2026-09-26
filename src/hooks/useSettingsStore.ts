import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { logger } from '@/utils/logger'
import { storeApi } from '@/lib/api/storeApi'
import { useOrganization } from '@/hooks/useOrganization'
import { resolveSettingsStore } from '@/components/settings/settingsCatalog'

export const useSettingsStore = (allowAll = false) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { organizationId } = useOrganization()
  const [result, setResult] = useState<{ organizationId: string; stores: { id: string; name: string }[]; error: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!organizationId) return
    storeApi.getAll().then(stores => {
      if (!cancelled) setResult({ organizationId, stores, error: '' })
    }).catch(error => {
      logger.error('店舗取得エラー:', error)
      if (!cancelled) setResult({ organizationId, stores: [], error: '店舗を取得できませんでした。ページを再読み込みしてください。' })
    })
    return () => { cancelled = true }
  }, [organizationId])
  const ready = result?.organizationId === organizationId && !!organizationId
  const stores = ready ? result.stores : []
  const selectedStoreId = resolveSettingsStore(stores, searchParams.get('store'), allowAll)
  const handleStoreChange = (storeId: string) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('store', storeId)
      return next
    })
  }
  return { stores, selectedStoreId, loading: !ready, error: ready ? result.error : '', handleStoreChange }
}
