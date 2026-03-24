import { supabase } from '@/lib/supabase'

/** 予約サイト・プラットフォームで「公開」として扱うマスターステータス */
const PUBLIC_MASTER_STATUSES = ['available', 'published', 'approved'] as const

export type PublicRelatedScenarioForUi = {
  id: string
  slug?: string
  title: string
  key_visual_url?: string
  author: string
  player_count_min: number
  player_count_max: number
  duration: number
}

/**
 * 同じ作者の「公開中」シナリオのみ取得（関連作品用）
 * - org_status = available
 * - master_status は公開扱いの値に限定
 * - scenario_master_id で重複除去（複数組織で掲載されている場合は先頭行を採用）
 */
export async function fetchPublicRelatedScenariosByAuthor(params: {
  author: string
  excludeScenarioMasterId: string
  organizationId?: string
  limit?: number
}): Promise<PublicRelatedScenarioForUi[]> {
  const { author, excludeScenarioMasterId, organizationId, limit = 6 } = params
  const trimmed = author?.trim()
  if (!trimmed) return []

  let query = supabase
    .from('organization_scenarios_with_master')
    .select('scenario_master_id, title, key_visual_url, player_count_min, player_count_max, duration, slug')
    .eq('org_status', 'available')
    .in('master_status', [...PUBLIC_MASTER_STATUSES])
    .eq('author', trimmed)
    .neq('scenario_master_id', excludeScenarioMasterId)
    .order('title')
    .limit(120)

  if (organizationId) {
    query = query.eq('organization_id', organizationId)
  }

  const { data: rows, error } = await query
  if (error) throw error

  const seen = new Set<string>()
  const picked: PublicRelatedScenarioForUi[] = []

  for (const row of rows || []) {
    const mid = row.scenario_master_id as string | undefined
    if (!mid || seen.has(mid)) continue
    seen.add(mid)
    picked.push({
      id: mid,
      slug: (row.slug as string | null) || mid,
      title: (row.title as string) || '',
      key_visual_url: (row.key_visual_url as string | null) || undefined,
      author: trimmed,
      player_count_min: (row.player_count_min as number) ?? 0,
      player_count_max: (row.player_count_max as number) ?? 0,
      duration: (row.duration as number) ?? 0,
    })
    if (picked.length >= limit) break
  }

  return picked
}

/** UI 表示直前の最終ガード（データ経路が増えたとき用） */
export function filterRelatedScenariosForPublicUi(
  scenarios: PublicRelatedScenarioForUi[]
): PublicRelatedScenarioForUi[] {
  return scenarios.filter(s => Boolean(s.id && s.title?.trim()))
}
