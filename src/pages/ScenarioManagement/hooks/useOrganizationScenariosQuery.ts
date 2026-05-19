import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isMissingColumnOrSchemaSelectError } from '@/lib/organization'
import { buildGmListBadgeMap, type GmListBadgeEntry } from '@/lib/gmScenarioMode'
import { logger } from '@/utils/logger'

export interface OrganizationScenarioWithMaster {
  id: string
  org_scenario_id: string
  organization_id: string
  scenario_master_id: string
  slug: string | null
  org_status: 'available' | 'unavailable' | 'coming_soon'
  pricing_patterns: any[]
  gm_assignments: any[]
  created_at: string
  updated_at: string
  extra_preparation_time: number | null
  title: string
  author: string | null
  key_visual_url: string | null
  description: string | null
  player_count_min: number
  player_count_max: number
  duration: number
  genre: string[]
  difficulty: string | null
  participation_fee: number | null
  master_status: 'draft' | 'pending' | 'approved' | 'rejected'
  license_amount: number | null
  gm_test_license_amount: number | null
  available_gms: string[] | null
  gm_list_badges?: GmListBadgeEntry[] | null
  experienced_staff: string[] | null
  available_stores: string[] | null
  gm_costs: any[] | null
  gm_count: number | null
  play_count: number | null
}

export interface StoreInfo {
  id: string
  short_name: string
  name: string
  ownership_type?: string
  is_temporary?: boolean
}

export interface OrgScenariosData {
  scenarios: OrganizationScenarioWithMaster[]
  storeMap: Map<string, StoreInfo>
  organizationName: string
}

const ORG_SCENARIOS_WITH_MASTER_LIST_SELECT = `
  id,
  org_scenario_id,
  organization_id,
  scenario_master_id,
  slug,
  org_status,
  pricing_patterns,
  gm_assignments,
  created_at,
  updated_at,
  extra_preparation_time,
  title,
  author,
  author_id,
  key_visual_url,
  description,
  synopsis,
  caution,
  player_count_min,
  player_count_max,
  duration,
  genre,
  difficulty,
  participation_fee,
  master_status,
  play_count,
  available_gms,
  available_stores,
  gm_costs,
  gm_count,
  license_amount,
  gm_test_license_amount,
  experienced_staff
` as const

function isSessionOrRlsError(err: unknown): 'session' | 'rls' | null {
  if (!err || typeof err !== 'object') return null
  const o = err as { code?: string; message?: string }
  const code = String(o.code || '')
  const msg = (o.message || '').toLowerCase()
  if (code === '42501' || msg.includes('row-level security')) return 'rls'
  if (code === 'PGRST301' || msg.includes('jwt') || msg.includes('not authorized') || msg.includes('invalid refresh')) return 'session'
  return null
}

async function fetchOrgScenariosData(organizationId: string): Promise<OrgScenariosData> {
  const [orgResult, storesResult, scenariosFirst] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', organizationId).single(),
    supabase.from('stores').select('id, name, short_name, ownership_type, is_temporary').eq('organization_id', organizationId),
    supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_WITH_MASTER_LIST_SELECT)
      .eq('organization_id', organizationId)
      .order('title', { ascending: true }),
  ])

  let scenariosResult = scenariosFirst
  if (scenariosResult.error && isMissingColumnOrSchemaSelectError(scenariosResult.error)) {
    logger.warn('organization_scenarios_with_master: 明示列 select が失敗したため select(*) にフォールバック', scenariosResult.error)
    scenariosResult = await supabase
      .from('organization_scenarios_with_master')
      .select(ORG_SCENARIOS_WITH_MASTER_LIST_SELECT)
      .eq('organization_id', organizationId)
      .order('title', { ascending: true })
  }

  const storeMap = new Map<string, StoreInfo>()
  if (storesResult.data) {
    storesResult.data.forEach(store => {
      storeMap.set(store.id, {
        id: store.id,
        name: store.name,
        short_name: store.short_name || store.name,
        ownership_type: store.ownership_type,
        is_temporary: store.is_temporary,
      })
    })
  } else {
    logger.error('店舗データの取得に失敗:', storesResult.error)
  }

  const fetchError = scenariosResult.error
  if (fetchError) {
    const kind = isSessionOrRlsError(fetchError)
    if (kind === 'session') throw new Error('セッションが無効です。ログアウトしてから再度ログインしてください。')
    if (kind === 'rls') throw new Error('シナリオ一覧を参照する権限がありません。スタッフ／管理者アカウントでログインしているか確認してください。')
    throw new Error('シナリオの取得に失敗しました')
  }

  const data = scenariosResult.data || []

  // available_stores 補完 と GM バッジ取得を並列実行
  const scenarioMasterIds = data.map(s => s.scenario_master_id).filter(Boolean) as string[]
  const uniqueMasterIds = [...new Set(scenarioMasterIds)]
  const missingIds = data
    .filter(s => !s.available_stores || s.available_stores.length === 0)
    .map(s => s.scenario_master_id)
    .filter(Boolean) as string[]

  const [availableStoresMap, gmBadgeMap] = await Promise.all([
    // Step 2: available_stores 補完（ビューで空だった場合のみ）
    (async (): Promise<Map<string, string[]>> => {
      const map = new Map<string, string[]>()
      if (missingIds.length === 0) return map
      const { data: rows } = await supabase
        .from('organization_scenarios')
        .select('scenario_master_id, available_stores')
        .eq('organization_id', organizationId)
        .in('scenario_master_id', missingIds)
      rows?.forEach(os => {
        if (os.scenario_master_id && os.available_stores?.length > 0) {
          map.set(os.scenario_master_id, os.available_stores)
        }
      })
      return map
    })(),

    // Step 3: GM バッジ（メイン/サブ）を一括取得
    (async (): Promise<Map<string, GmListBadgeEntry[]> | null> => {
      if (uniqueMasterIds.length === 0) return null
      const map = new Map<string, GmListBadgeEntry[]>()
      const chunkSize = 120
      try {
        for (let i = 0; i < uniqueMasterIds.length; i += chunkSize) {
          const chunk = uniqueMasterIds.slice(i, i + chunkSize)
          const { data: gmRows, error: gmErr } = await supabase
            .from('staff_scenario_assignments')
            .select('scenario_master_id, can_main_gm, can_sub_gm, staff:staff_id ( name )')
            .eq('organization_id', organizationId)
            .in('scenario_master_id', chunk)
            .or('can_main_gm.eq.true,can_sub_gm.eq.true')
          if (gmErr) throw gmErr
          buildGmListBadgeMap(gmRows || []).forEach((entries, sid) => map.set(sid, entries))
        }
        return map
      } catch (gmFetchErr) {
        logger.warn('担当GMのメイン／サブ情報取得に失敗。従来表示にフォールバックします', gmFetchErr)
        return null
      }
    })(),
  ])

  const scenarios = data.map((scenario: OrganizationScenarioWithMaster) => {
    const viewStores = scenario.available_stores && scenario.available_stores.length > 0 ? scenario.available_stores : null
    const mapStores = availableStoresMap.get(scenario.scenario_master_id)
    return {
      ...scenario,
      gm_list_badges: gmBadgeMap?.get(scenario.scenario_master_id) ?? null,
      available_stores: viewStores || mapStores || [],
    }
  })

  return {
    scenarios,
    storeMap,
    organizationName: orgResult.data?.name || '',
  }
}

export const orgScenariosKeys = {
  list: (orgId: string) => ['org-scenarios', 'list', orgId] as const,
}

export function useOrganizationScenariosQuery(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: orgScenariosKeys.list(organizationId ?? ''),
    queryFn: () => fetchOrgScenariosData(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useInvalidateOrgScenarios() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['org-scenarios', 'list'] })
}
