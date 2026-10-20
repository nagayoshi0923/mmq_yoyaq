/**
 * 貸切を受け付ける範囲（今日から何日先の公演日まで申し込めるか）。I21。
 * 設定の優先順位: MMQ の既定（180）→ 組織 → 作品 → 公演（後のものが上書き。運営設定のキー private_booking_horizon_days）。
 * 設定画面: 設定 › 貸切予約の受付締切（組織）、作品編集 › ゲーム設定（作品）、公演の個別設定（公演）。変えられるのは管理者だけ。
 * 判定の正本は DB（assert_private_booking_candidate_date。保存・空き判定とも同じ）。画面はこの値で先の日を出さない・進めない。
 * 仕様の正本: docs/product-spec/貸切受付ルール.md（2026-10-20 本番 #1140: カレンダーから 180 日より先の貸切を申し込めた）
 */
import { useQuery } from '@tanstack/react-query'
import { toJstYmd } from '@/utils/jstDate'
import { logger } from '@/utils/logger'

/** MMQ の既定（設定が無いとき・読めないとき。DB の get_operating_setting_default と同じ） */
export const DEFAULT_PRIVATE_BOOKING_HORIZON_DAYS = 180
/** 設定できる範囲（supabase/functions/_shared/setting-definitions.ts と同じ）。181 日以上は公開の空き取得（1 回 180 日まで）も変える必要がある */
export const MIN_PRIVATE_BOOKING_HORIZON_DAYS = 1
export const MAX_PRIVATE_BOOKING_HORIZON_DAYS = 180

/** 設定を保存したら、このキーで始まる読み込みを無効化する（useOperatingSettings） */
export const PRIVATE_BOOKING_HORIZON_QUERY_KEY = 'private-booking-horizon-days'

/** YYYY-MM-DD の暦日加算（UTC 部品で計算するため見ている人のタイムゾーンに依存しない） */
export function addYmdDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** 申し込める最後の日（日本時間の今日 + 日数） */
export function privateBookingHorizonMaxYmd(horizonDays: number, now: Date = new Date()): string {
  return addYmdDays(toJstYmd(now), horizonDays)
}

/** 申し込める範囲より先の日か */
export function isBeyondPrivateBookingHorizon(ymd: string, horizonDays: number, now: Date = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd > privateBookingHorizonMaxYmd(horizonDays, now)
}

/** 画面・DB で同じ文面 */
export function privateBookingTooFarText(horizonDays: number): string {
  return `申し込めるのは今日から ${horizonDays} 日先までです`
}

function normalize(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= MIN_PRIVATE_BOOKING_HORIZON_DAYS && value <= MAX_PRIVATE_BOOKING_HORIZON_DAYS
    ? value : DEFAULT_PRIVATE_BOOKING_HORIZON_DAYS
}

/**
 * 実際に効く日数を読む。作品を渡せば作品の値まで、渡さなければ入口用（組織の値と公開中の作品の個別指定のうち最長）。
 * 読めないとき（DB の関数が未適用など）は既定の 180 日（保存の検査は DB で別に効く）。
 */
export async function fetchPrivateBookingHorizonDays(options: { organizationId?: string | null; scenarioId?: string | null }): Promise<number> {
  if (!options.organizationId) return DEFAULT_PRIVATE_BOOKING_HORIZON_DAYS
  // 日付の計算だけを使う画面・試験で Supabase の接続を読み込まないよう、読むときだけ取り込む
  const { privateBookingSlotReadApi } = await import('@/lib/api/scheduleHookReadApi')
  const { data, error } = await privateBookingSlotReadApi.getEffectiveHorizonDays({
    organizationId: options.organizationId,
    scenarioId: options.scenarioId ?? null,
  })
  if (error) {
    logger.warn('貸切を受け付ける範囲を読み込めませんでした（既定の 180 日で表示します）', error)
    return DEFAULT_PRIVATE_BOOKING_HORIZON_DAYS
  }
  return normalize(data)
}

/**
 * 実際に効く日数。設定を保存すると管理画面が PRIVATE_BOOKING_HORIZON_QUERY_KEY を無効化する。
 * 他の人の画面にも早く効くよう、開き直し・画面に戻ったときに読み直す（staleTime 0）。
 */
export function usePrivateBookingHorizonDays(options: { organizationId?: string | null; scenarioId?: string | null }): { days: number; loading: boolean } {
  const organizationId = options.organizationId ?? null
  const scenarioId = options.scenarioId ?? null
  const { data, isPending } = useQuery({
    queryKey: [PRIVATE_BOOKING_HORIZON_QUERY_KEY, organizationId, scenarioId],
    queryFn: () => fetchPrivateBookingHorizonDays({ organizationId, scenarioId }),
    enabled: Boolean(organizationId),
    staleTime: 0,
  })
  return { days: data ?? DEFAULT_PRIVATE_BOOKING_HORIZON_DAYS, loading: Boolean(organizationId) && isPending }
}
