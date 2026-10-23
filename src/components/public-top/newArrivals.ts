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

/** 新作一覧に出す作品と日付（期間内だけ、日付の新しい順）。todayYmd は JST の今日 */
export function pickNewArrivals<T extends NewArrivalCandidate>(items: readonly T[], todayYmd: string, limit = NEW_ARRIVALS_LIMIT): Array<{ item: T; date: NewArrivalDate }> {
  return items
    .map((item) => ({ item, date: newArrivalDate(item) }))
    .filter((x): x is { item: T; date: NewArrivalDate } => x.date !== null && isWithinNewArrivalPeriod(x.date.date, todayYmd))
    .sort((a, b) => b.date.date.localeCompare(a.date.date) || a.item.title.localeCompare(b.item.title, 'ja'))
    .slice(0, limit)
}

/** 「掲載登録日：2026.10.13」「リリース日：2026.10.13」 */
export function formatNewArrivalDate({ date, kind }: NewArrivalDate): string {
  return `${kind === 'release' ? 'リリース日' : '掲載登録日'}：${date.slice(0, 10).replace(/-/g, '.')}`
}
