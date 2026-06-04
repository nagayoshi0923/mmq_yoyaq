/**
 * スタッフ単位で「公演 (GM) 回数」と「スタッフ参加回数」を集計する hook。
 *
 * React Query 経由で取得 + キャッシュ。ページ初回ロードは empty の Map を返し、
 * 取得が完了したら counts が埋まる (ページ描画はブロックしない)。
 *
 * - GM 回数: schedule_events.gms[] に名前が含まれ、gm_roles[name] が 'main' / 'sub' / 未指定
 *   (= 通常 GM とみなす)、かつ category が実公演 (open/private/offsite/gmtest)、is_cancelled=false
 * - スタッフ参加回数: schedule_events.gm_roles[name] === 'staff' のもの
 *
 * パフォーマンス: 過去 12 ヶ月のみを対象 (全期間だと数千件で重くなる)。
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'

export interface StaffPerformanceCount {
  gmCount: number
  staffCount: number
}

type Row = {
  gms: string[] | null
  gm_roles: Record<string, string> | null
  category: string | null
}

const REAL_PERF_CATEGORIES = new Set(['open', 'private', 'offsite', 'gmtest'])

function dateAgo(monthsAgo: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo)
  return d.toISOString().slice(0, 10)
}

async function fetchCounts(): Promise<Map<string, StaffPerformanceCount>> {
  const orgId = await getCurrentOrganizationId()
  if (!orgId) return new Map()

  const since = dateAgo(12) // 過去 12 ヶ月
  const until = new Date().toISOString().slice(0, 10) // 今日まで (未来公演は除外)

  const { data, error } = await supabase
    .from('schedule_events')
    .select('gms, gm_roles, category')
    .eq('organization_id', orgId)
    .eq('is_cancelled', false)
    .gte('date', since)
    .lte('date', until)

  if (error) {
    logger.error('useStaffPerformanceCounts: query error', error)
    return new Map()
  }

  const map = new Map<string, StaffPerformanceCount>()
  const inc = (name: string, key: keyof StaffPerformanceCount) => {
    const cur = map.get(name) ?? { gmCount: 0, staffCount: 0 }
    cur[key] += 1
    map.set(name, cur)
  }

  for (const row of (data ?? []) as Row[]) {
    const gms = row.gms ?? []
    if (gms.length === 0) continue
    const isRealPerf = REAL_PERF_CATEGORIES.has(row.category ?? '')
    const roles = row.gm_roles ?? {}
    for (const name of gms) {
      if (!name || typeof name !== 'string') continue
      const role = roles[name]
      if (role === 'staff') {
        inc(name, 'staffCount')
      } else if (role === 'observer' || role === 'reception') {
        // どちらにもカウントしない
      } else if (isRealPerf) {
        // main / sub / 未指定 (= デフォルト main 扱い)
        inc(name, 'gmCount')
      }
    }
  }
  return map
}

const EMPTY_MAP = new Map<string, StaffPerformanceCount>()
const ZERO = { gmCount: 0, staffCount: 0 }

export function useStaffPerformanceCounts() {
  const query = useQuery({
    queryKey: ['staff-performance-counts'],
    queryFn: fetchCounts,
    staleTime: 5 * 60 * 1000, // 5 分キャッシュ
    refetchOnWindowFocus: false,
  })

  const counts = query.data ?? EMPTY_MAP

  const getPerformanceCount = useMemo(
    () => (name: string) => counts.get(name) ?? ZERO,
    [counts]
  )

  return { counts, loading: query.isLoading, getPerformanceCount }
}
