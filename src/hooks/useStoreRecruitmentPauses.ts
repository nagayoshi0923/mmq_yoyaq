import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import type { StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'

export function useStoreRecruitmentPauses(organizationId?: string | null) {
  const [periods, setPeriods] = useState<StoreRecruitmentPausePeriod[]>([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!organizationId) {
      setPeriods([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('store_recruitment_pauses')
        .select('id, store_id, organization_id, pause_type, starts_on, ends_on')
        .eq('organization_id', organizationId)
      if (error) throw error
      setPeriods((data || []) as StoreRecruitmentPausePeriod[])
    } catch (err) {
      logger.error('店舗募集停止の取得に失敗', err)
      setPeriods([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { periods, loading, reload }
}
