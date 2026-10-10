/**
 * グループページ・招待ページで出す「作品について」の読み取り。
 * 作品ページ（ScenarioDetailPage）と同じ公開用の読み取り経路（/api/scenarios?id=…&org_id=…。
 * お客様・ゲスト・未ログインは公開用の列だけ）を使うので、作品ページに出ている以上のことは出ない。
 * キャラクターも作品ページと同じ organization_scenarios.characters（公開用の列に含まれる）。
 * 店舗の住所は公開用の stores_public から。
 */
import { useQuery } from '@tanstack/react-query'
import { scenarioApi, storeApi } from '@/lib/api'
import { privateGroupPageReadApi } from '@/lib/api/privateGroupPageReadApi'
import { logger } from '@/utils/logger'
import { toGroupScenarioInfo, type GroupScenarioInfo } from './overviewModel'

export type { GroupScenarioInfo }

export interface GroupScenarioData {
  scenario: GroupScenarioInfo | null
  /** 組織の slug（作品ページ・注意事項の URL） */
  orgSlug: string | null
  stores: Array<{ id: string; name: string; short_name?: string | null; address?: string | null }>
}

async function fetchGroupScenarioData(scenarioMasterId: string | null, organizationId: string): Promise<GroupScenarioData> {
  const [scenario, org, stores] = await Promise.all([
    scenarioMasterId
      ? scenarioApi.getById(scenarioMasterId, organizationId).catch(err => {
        // 受付を止めた作品などは公開用の読み取りで見つからない。グループの読み取り結果（作品名・画像）だけで出す
        logger.warn('[group-scenario-info] 作品の公開情報を読めませんでした', err)
        return null
      })
      : Promise.resolve(null),
    privateGroupPageReadApi.findOrganizationSlug(organizationId),
    storeApi.getAllPublic(organizationId).catch(err => {
      logger.warn('[group-scenario-info] 店舗の公開情報を読めませんでした', err)
      return []
    }),
  ])
  return {
    scenario: scenario ? toGroupScenarioInfo(scenario as unknown as Record<string, unknown>) : null,
    orgSlug: (org.data as { slug?: string | null } | null)?.slug ?? null,
    stores: stores.map(s => ({ id: s.id, name: s.name, short_name: s.short_name, address: s.address })),
  }
}

export function useGroupScenarioInfo(scenarioMasterId: string | null, organizationId: string | null | undefined) {
  return useQuery({
    queryKey: ['group-scenario-info', scenarioMasterId, organizationId],
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchGroupScenarioData(scenarioMasterId, organizationId as string),
  })
}
