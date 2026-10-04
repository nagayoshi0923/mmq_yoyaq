/**
 * 貸切リクエスト管理の一覧の絞り込み・タブ分け・店舗の並べ方（画面から切り出した純粋な関数）。
 */
import type { PrivateBookingRequest } from '../hooks/usePrivateBookingData'

export type TabValue = 'gm_pending' | 'store_pending' | 'rejected' | 'approved' | 'all'

export interface RequestListFilters {
  searchText: string
  scenarioFilter: string
  storeFilter: string
  dateRangeStart?: string
  dateRangeEnd?: string
}

/** 絞り込み条件に合うか（フリーワード・シナリオ・店舗・期間） */
export function matchesRequestFilters(req: PrivateBookingRequest, filters: RequestListFilters): boolean {
  const normalizedSearch = filters.searchText.trim().toLowerCase()
  // フリーワード（予約番号・顧客名・メール・電話・シナリオ名・招待コード）
  if (normalizedSearch) {
    const hit = [
      req.reservation_number,
      req.customer_name,
      req.customer_email,
      req.customer_phone,
      req.scenario_title,
      req.invite_code,
    ].some(v => (v || '').toLowerCase().includes(normalizedSearch))
    if (!hit) return false
  }
  // シナリオ
  if (filters.scenarioFilter !== 'all' && req.scenario_title !== filters.scenarioFilter) return false
  // 店舗（確定店舗または希望店舗のいずれかに一致）
  if (filters.storeFilter !== 'all') {
    const cd = req.candidate_datetimes
    const storeNames = [
      cd?.confirmedStore?.storeName,
      ...(cd?.requestedStores || []).map(s => s.storeName),
    ].filter(Boolean) as string[]
    if (!storeNames.includes(filters.storeFilter)) return false
  }
  // 期間（候補日の最初の日付）
  if (filters.dateRangeStart || filters.dateRangeEnd) {
    const firstDate = req.candidate_datetimes?.candidates?.[0]?.date
    if (!firstDate) return false
    if (filters.dateRangeStart && firstDate < filters.dateRangeStart) return false
    if (filters.dateRangeEnd && firstDate > filters.dateRangeEnd) return false
  }
  return true
}

export function hasActiveRequestFilters(filters: RequestListFilters): boolean {
  return !!filters.searchText.trim().toLowerCase() || filters.scenarioFilter !== 'all' || filters.storeFilter !== 'all' || !!filters.dateRangeStart || !!filters.dateRangeEnd
}

/** 絞り込みプルダウンのシナリオの選択肢（全データから生成） */
export function buildScenarioOptions(requests: PrivateBookingRequest[]): string[] {
  return Array.from(new Set(requests.map(r => r.scenario_title).filter(Boolean))).sort()
}

/** 絞り込みプルダウンの店舗の選択肢（確定店舗と希望店舗） */
export function buildStoreOptions(requests: PrivateBookingRequest[]): string[] {
  const names = new Set<string>()
  requests.forEach(r => {
    const cd = r.candidate_datetimes
    if (cd?.confirmedStore?.storeName) names.add(cd.confirmedStore.storeName)
    cd?.requestedStores?.forEach(s => { if (s.storeName) names.add(s.storeName) })
  })
  return Array.from(names).sort()
}

const awaitingApproval = (r: PrivateBookingRequest) => ['pending', 'pending_gm', 'gm_confirmed', 'pending_store'].includes(r.status)

// 承認済み・却下済みタブは「動きがあった順」（承認・キャンセルなど直近に処理した
// ものが上）に並べる。申込日順だと、古い申込を今処理したときにリストの奥へ
// 消えてしまう感覚になるため（オーナー指示 2026-06-13）。
const activityTime = (r: PrivateBookingRequest): number =>
  Math.max(
    r.cancelled_at ? new Date(r.cancelled_at).getTime() : 0,
    r.approved_at ? new Date(r.approved_at).getTime() : 0,
    r.created_at ? new Date(r.created_at).getTime() : 0
  )
const byActivityDesc = (a: PrivateBookingRequest, b: PrivateBookingRequest) => activityTime(b) - activityTime(a)

/**
 * タブ分け。保存済み status だけでなく、在籍・資格・候補・人数の共通判定（gm_team_ready）で作業キューを分ける。
 * 作業キュー系タブ（GM確認中・店舗承認待ち）は従来どおり申込順。
 */
export function splitRequestsIntoTabs(visibleRequests: PrivateBookingRequest[]) {
  return {
    gmPending: visibleRequests.filter(r => awaitingApproval(r) && r.gm_team_ready !== true),
    storePending: visibleRequests.filter(r => awaitingApproval(r) && r.gm_team_ready === true),
    // 却下済み: cancelled かつ承認実績なし（承認前に断ったもの）
    rejected: visibleRequests.filter(r => r.status === 'cancelled' && !r.approver_name).sort(byActivityDesc),
    // 承認済み: 一度でも承認したもの（確定中＋確定後キャンセルの両方）。
    // タブは「却下したか／承認したか」の意思決定で分ける（オーナー指示 2026-06-13）。
    approved: visibleRequests.filter(r => r.status === 'confirmed' || (r.status === 'cancelled' && !!r.approver_name)).sort(byActivityDesc),
  }
}

/** 表示件数で切る（'all' なら全件） */
export function applyDisplayLimit<T>(reqs: T[], displayLimit: string): T[] {
  if (displayLimit === 'all') return reqs
  const limit = parseInt(displayLimit, 10)
  return reqs.slice(0, limit)
}

/** 店舗を地域ごとにまとめる（東京を先に、その他の地域、未分類は最後） */
export function groupStoresByRegion<T extends { region?: string | null }>(stores: T[]): { grouped: Record<string, T[]>; sortedRegions: string[] } {
  const grouped: Record<string, T[]> = {}
  stores.forEach(store => {
    const region = store.region || '未分類'
    if (!grouped[region]) grouped[region] = []
    grouped[region].push(store)
  })
  const regionOrder = ['東京', '埼玉', '神奈川', '千葉', 'その他', '未分類']
  const sortedRegions = Object.keys(grouped).sort((a, b) => {
    const indexA = regionOrder.indexOf(a)
    const indexB = regionOrder.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
  return { grouped, sortedRegions }
}

/** スタッフマスタ＋GM回答のみにいる ID を統合（一覧の取りこぼし防止）。名前順 */
export function mergeGmOptions(
  allGMs: Array<{ id: string; name: string; avatar_color?: string | null }>,
  availableGMs: Array<{ gm_id?: string | number | null; gm_name?: string | null; avatar_color?: string | null }>,
): Array<{ id: string; name: string; avatar_color?: string | null }> {
  const byId = new Map<string, { id: string; name: string; avatar_color?: string | null }>()
  for (const gm of allGMs) {
    if (gm?.id) byId.set(String(gm.id), gm)
  }
  for (const ag of availableGMs) {
    const sid = ag.gm_id != null ? String(ag.gm_id) : ''
    if (!sid || byId.has(sid)) continue
    byId.set(sid, {
      id: sid,
      name: ag.gm_name || '（スタッフ名不明）',
      avatar_color: ag.avatar_color ?? null,
    })
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja', { sensitivity: 'base' }))
}
