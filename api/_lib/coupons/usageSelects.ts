// coupon_usages と reservations の間には外部キーが 2 本ある。
//   coupon_usages.reservation_id → reservations.id（使用履歴がどの予約で使われたか）
//   reservations.coupon_usage_id → coupon_usages.id（予約に付いている使用。#1091 人数変更で割引を維持）
// どちらを使うかを書かないと PostgREST の埋め込みが PGRST201（関係が曖昧）で失敗するため、
// 埋め込みは必ずここの定数を通して外部キー名を明示する。
export const COUPON_USAGE_RESERVATION_FK = 'coupon_usages_reservation_id_fkey'
export const RESERVATION_COUPON_USAGE_FK = 'reservations_coupon_usage_id_fkey'

/** coupon_usages から「使われた予約」を埋め込む。alias は返却時のキー名 */
export function usageReservationEmbed(columns: string, options: { alias?: string; inner?: boolean } = {}): string {
  const alias = options.alias ?? 'reservations'
  return `${alias}:reservations!${COUPON_USAGE_RESERVATION_FK}${options.inner ? '!inner' : ''}(${columns})`
}

/** reservations から公演（schedule_events）を埋め込む外部キー名 */
export const RESERVATION_EVENT_FK = 'reservations_schedule_event_id_fkey'

/**
 * お客様のクーポン一覧（/api/coupons?type=all）で読む使用履歴の列。
 * 公演当日の判定（来店確認の「もぎる」）は公演の日付が正なので、予約の公演（日付・開始時刻）も読む。
 * requested_datetime は予約を作った時刻が入っている予約があるため、公演の無い予約の代わりにだけ使う（20261020220000）。
 */
export function customerUsageSelect(withRedeem: boolean): string {
  const base = [
    'id', 'customer_coupon_id', 'reservation_id', 'used_at', 'discount_amount',
    usageReservationEmbed(`id, title, status, requested_datetime, store_id, stores ( name, short_name ), schedule_events!${RESERVATION_EVENT_FK} ( date, start_time )`),
  ]
  if (withRedeem) base.push('redeemed_at', 'redeemed_source')
  return base.join(', ')
}

/** 管理画面: 顧客ごとの使用履歴（予約が自組織のものに限る） */
export const ADMIN_CUSTOMER_USAGE_SELECT = [
  'id, discount_amount, used_at',
  usageReservationEmbed('id, title, requested_datetime', { inner: true }),
  'customer_coupons!inner(customer_id, organization_id, coupon_campaigns!inner(organization_id))',
].join(', ')

/** 管理画面: 発行クーポン 1 件の使用履歴 */
export const ADMIN_COUPON_USAGE_SELECT = [
  'id, reservation_id, discount_amount, used_at',
  usageReservationEmbed('title'),
].join(', ')
