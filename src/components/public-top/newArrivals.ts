/**
 * トップの「新作一覧」（MMQ 全体トップ・店舗トップで共通。2026-10-23 QW-20261023-001、Figma 改善案 611-80）。
 *
 * 抽出: 公開条件だけ（呼び出し側の既存の取得結果をそのまま使う。公開中 org_status=available・作品マスタ承認済み・
 *   ガイド用 gm_test を除く・公開キー get_public_available_scenario_keys に含まれる。全体トップは全組織、店舗トップはその組織）。
 *   「新作」タグ（ジャンル・リリース日 30 日以内）では絞らない（タグの無い新しい作品が漏れるため）。
 *
 * 並びのキー（DB は変えない。公開用ビュー organization_scenarios_with_master の列だけを使う）:
 * - 作品マスタの「リリース日」（release_date。管理画面のシナリオマスタ編集で「リリース日」として入力する日付）があればそれ。
 * - 無ければ「掲載登録日」= その組織が作品を一覧に登録した日時（organization_scenarios.created_at を JST の日付に）。
 *   これは行を作った日時で、準備中から公開中に変えた日時とは限らない（公開状態の変更履歴は DB に無い）。
 *   そのため画面では「公開日」と書かず「掲載登録日」と書く。2026-10-23 時点の本番は公開作品 198 件すべてでリリース日が空。
 * 期間（2026-10-24 社長承認「そうしよう90日案」）: 基準日（上の日付。JST の暦日）を 1 日目として 90 日間。
 *   経過日数 0〜89 日が新作、90 日以上は対象外。基準日が今日より先（未来）の作品は期間が始まる前なので出さない。
 * 並び: 日付の新しい順 → 同じ日なら題名順。最大 NEW_ARRIVALS_LIMIT 件（期間内が少なければその件数、0 件なら区画を出さない）。
 * 日付がどちらも無い作品は出さない。
 */
import { formatDateJST } from '@/utils/dateUtils'

export const NEW_ARRIVALS_LIMIT = 12
/** 新作の期間（基準日を 1 日目として 90 日間。経過 0〜89 日） */
export const NEW_ARRIVALS_DAYS = 90

export interface NewArrivalCandidate {
  title: string
  /** 新作の対象か（isNewArrivalTarget / newArrivalBasis）。false なら新作にしない。未指定は対象（単体の計算用） */
  new_arrival_target?: boolean
  /** 作品マスタのリリース日（YYYY-MM-DD） */
  release_date: string | null
  /** 組織が作品を一覧に登録した日時（ISO。organization_scenarios.created_at） */
  listed_at: string | null
}

export type NewArrivalDateKind = 'release' | 'listed'

export interface NewArrivalDate {
  /** YYYY-MM-DD */
  date: string
  /** release = リリース日、listed = 掲載登録日 */
  kind: NewArrivalDateKind
}

/** 並びに使う日付。リリース日 → 掲載登録日の順。どちらも無ければ null */
export function newArrivalDate(item: Pick<NewArrivalCandidate, 'release_date' | 'listed_at'>): NewArrivalDate | null {
  if (item.release_date) return { date: item.release_date.slice(0, 10), kind: 'release' }
  if (item.listed_at) {
    const d = new Date(item.listed_at)
    if (!Number.isNaN(d.getTime())) return { date: formatDateJST(d), kind: 'listed' }
  }
  return null
}

/** 基準日（YYYY-MM-DD）から今日（JST の YYYY-MM-DD）までの経過日数。暦日の差なので時差・うるう日・月末の影響を受けない */
export function elapsedDays(fromYmd: string, todayYmd: string): number {
  const toUtc = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))
  return Math.round((toUtc(todayYmd) - toUtc(fromYmd)) / 86_400_000)
}

/** 新作の期間の中か（経過 0〜89 日。未来の基準日は外） */
export function isWithinNewArrivalPeriod(date: string, todayYmd: string): boolean {
  const days = elapsedDays(date, todayYmd)
  return days >= 0 && days < NEW_ARRIVALS_DAYS
}

/**
 * 新作か（トップの新作一覧とカタログの「新作」チップの判定はこれだけ）。
 * 基準日 = リリース日、無ければ掲載登録日の JST の日付。経過 0〜89 日が新作、未来の基準日・日付が無い作品は新作でない。
 * 返り値はその基準日（新作でなければ null）。
 */
export function newArrivalDateIfNew(item: Pick<NewArrivalCandidate, 'release_date' | 'listed_at'>, todayYmd: string): NewArrivalDate | null {
  const date = newArrivalDate(item)
  return date && isWithinNewArrivalPeriod(date.date, todayYmd) ? date : null
}

/** 新作の並び（基準日の新しい順 → 同じ日なら題名順）。トップとカタログで共通 */
export function compareNewArrivals(a: { date: NewArrivalDate; title: string }, b: { date: NewArrivalDate; title: string }): number {
  return b.date.date.localeCompare(a.date.date) || a.title.localeCompare(b.title, 'ja')
}

/** 新作一覧に出す作品と日付（期間内だけ、日付の新しい順）。todayYmd は JST の今日 */
export function pickNewArrivals<T extends NewArrivalCandidate>(items: readonly T[], todayYmd: string, limit = NEW_ARRIVALS_LIMIT): Array<{ item: T; date: NewArrivalDate }> {
  return items
    .map((item) => ({ item, date: item.new_arrival_target === false ? null : newArrivalDateIfNew(item, todayYmd) }))
    .filter((x): x is { item: T; date: NewArrivalDate } => x.date !== null)
    .sort((a, b) => compareNewArrivals({ date: a.date, title: a.item.title }, { date: b.date, title: b.item.title }))
    .slice(0, limit)
}

/** 新作の対象を決める作品の行（公開ビュー organization_scenarios_with_master の列） */
export interface NewArrivalSourceRow {
  organization_id?: string | null
  scenario_master_id?: string | null
  status?: string | null
  scenario_type?: string | null
  master_status?: string | null
}

/** 新作の対象の範囲（トップ・全体カタログ・組織カタログで同じものを渡す） */
export interface NewArrivalScope {
  /** 公開キー（get_public_available_scenario_keys の `${organization_id}_${scenario_master_id}`）。読めなかった・空なら null（既存と同じく絞らない） */
  publicKeys: ReadonlySet<string> | null
  /** 稼働中の組織 */
  activeOrganizationIds: ReadonlySet<string>
  /** 組織のトップ・カタログならその組織。全体なら null */
  organizationId: string | null
}

/** 公開キーの集合（既存の扱いと同じく、読めなかった・空なら null＝公開キーでは絞らない） */
export function newArrivalPublicKeys(
  keys: ReadonlyArray<{ organization_id: string; scenario_master_id: string }> | null | undefined,
  failed: boolean,
): ReadonlySet<string> | null {
  if (failed || !keys || keys.length === 0) return null
  return new Set(keys.map((k) => `${k.organization_id}_${k.scenario_master_id}`))
}

/**
 * 新作の対象か（トップの新作一覧・全体カタログ・組織カタログの「新作」チップで共通。Codex 最終レビュー 2026-10-24）。
 * 公開中・ガイド用（gm_test）でない・承認済みのマスタ・稼働中の組織・公開キーに含まれる・（組織なら）その組織の行。
 * 一般のカタログ（すべて・ほかのチップ）の対象は変えない。新作の判定に入る前にだけ通す。
 */
export function isNewArrivalTarget(row: NewArrivalSourceRow, scope: NewArrivalScope): boolean {
  if (row.status !== 'available') return false
  if (row.scenario_type === 'gm_test') return false
  if (row.master_status !== 'approved') return false
  const org = row.organization_id
  if (!org || !scope.activeOrganizationIds.has(org)) return false
  if (scope.organizationId && org !== scope.organizationId) return false
  if (scope.publicKeys && (!row.scenario_master_id || !scope.publicKeys.has(`${org}_${row.scenario_master_id}`))) return false
  return true
}

/**
 * 新作の対象かと、基準に使う掲載登録日時（対象の行のうちいちばん早い created_at。全体は組織をまたいで、組織はその組織の行）。
 * トップ・全体カタログ・組織カタログで、作品（作品マスタ）ごとの行を渡して使う。
 */
export function newArrivalBasis(
  rows: ReadonlyArray<NewArrivalSourceRow & { created_at?: string | null }>,
  scope: NewArrivalScope,
): { target: boolean; listed_at: string | null } {
  let target = false
  let best: string | null = null
  for (const r of rows) {
    if (!isNewArrivalTarget(r, scope)) continue
    target = true
    if (r.created_at && (best === null || new Date(r.created_at).getTime() < new Date(best).getTime())) best = r.created_at
  }
  return { target, listed_at: best }
}

/** 新作の対象の作品だけ判定する（対象外は、リリース日があっても新作にしない） */
export function newArrivalDateIfTarget(
  item: { new_arrival_target?: boolean; release_date: string | null; listed_at: string | null },
  todayYmd: string,
): NewArrivalDate | null {
  return item.new_arrival_target ? newArrivalDateIfNew(item, todayYmd) : null
}

/** カタログのカテゴリのチップで「新作」を表す値（URL は既存のカテゴリと同じ ?genre=新作） */
export const NEW_ARRIVAL_CHIP = '新作'

/**
 * カタログのカテゴリのチップの絞り込み（既存の規則のまま: 複数選べて、どれか 1 つに当てはまれば出す）。
 * 「新作」のチップだけは作品のジャンルの「新作」ではなく、上の 90 日の判定（isNew）で当てはめる。
 */
export function matchesCategoryChips(genres: readonly string[] | null | undefined, selected: readonly string[], isNew: boolean): boolean {
  if (selected.length === 0) return true
  return selected.some((cat) => (cat === NEW_ARRIVAL_CHIP ? isNew : !!genres?.includes(cat)))
}

/**
 * 「新作」のチップを選んでいるときのカタログの並び: 新作をトップと同じ並びで先に、残りは元の並びのまま後ろに。
 * 選んでいなければ元の並びのまま。
 */
export function sortCatalogForNewArrivals<T extends { title: string }>(
  list: readonly T[], selected: readonly string[], dateOf: (item: T) => NewArrivalDate | null,
): T[] {
  if (!selected.includes(NEW_ARRIVAL_CHIP)) return [...list]
  const withDate = list.map((item, index) => ({ item, index, date: dateOf(item) }))
  const fresh = withDate.filter((x): x is { item: T; index: number; date: NewArrivalDate } => x.date !== null)
    .sort((a, b) => compareNewArrivals({ date: a.date, title: a.item.title }, { date: b.date, title: b.item.title }))
  const rest = withDate.filter((x) => x.date === null)
  return [...fresh, ...rest].map((x) => x.item)
}

/** 「掲載登録日：2026.10.13」「リリース日：2026.10.13」 */
export function formatNewArrivalDate({ date, kind }: NewArrivalDate): string {
  return `${kind === 'release' ? 'リリース日' : '掲載登録日'}：${date.slice(0, 10).replace(/-/g, '.')}`
}
