/**
 * 作品編集画面の組織名と、予約サイト上のシナリオ詳細 URL に使う組織の略称（作品の所属組織を優先）。
 * ScenarioEditDialogV2.tsx から中身を変えずに移したもの。
 */
import { useEffect, useState } from 'react'
import { getCurrentOrganization, getOrganizationById } from '@/lib/organization'
import { getOrganizationSlugFromPath } from '@/lib/publicBookingPath'

export function useScenarioOrganizationNames(isOpen: boolean, scenarioId: string | null | undefined, scenarioOrgId: string | null) {
  const [organizationName, setOrganizationName] = useState<string>('')
  const [publicBookingOrgSlug, setPublicBookingOrgSlug] = useState<string>('')
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const sync = async () => {
      const currentOrg = await getCurrentOrganization()
      if (cancelled) return
      setOrganizationName(currentOrg?.name || '')

      let slugForPublic = currentOrg?.slug?.trim() || ''
      if (scenarioOrgId) {
        const scenarioOrg = await getOrganizationById(scenarioOrgId)
        if (cancelled) return
        if (scenarioOrg?.slug?.trim()) {
          slugForPublic = scenarioOrg.slug.trim()
        }
      }
      // ローカル等: users.organization が取れない・一覧の organization_id が遅延する場合のフォールバック
      if (!slugForPublic.trim()) {
        slugForPublic = getOrganizationSlugFromPath() ?? ''
      }
      if (!cancelled) {
        setPublicBookingOrgSlug(slugForPublic.trim())
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [isOpen, scenarioId, scenarioOrgId])
  return { organizationName, publicBookingOrgSlug }
}
