import type { BadgeProps } from '@/components/ui/badge'

type BadgeVariant = NonNullable<BadgeProps['variant']>

export interface StatusConfig {
  label: string
  variant: BadgeVariant
}

/**
 * 予約ステータス → 表示（ラベル + Badge variant）の一元マップ
 *
 * 旧実装（ReservationManagement.getStatusBadge / 貸切 StatusBadge /
 * 予約者タブの手書き span / CustomerRow の Badge）の置き換え先。
 * 表示を変えたいときはここだけを変える。
 */
export const RESERVATION_STATUS_CONFIG: Record<string, StatusConfig> = {
  confirmed: { label: '予約確定', variant: 'success' },
  pending: { label: '保留', variant: 'warning' },
  cancelled: { label: 'キャンセル', variant: 'gray' },
  pending_gm: { label: 'GM確認中', variant: 'info' },
  gm_confirmed: { label: 'GM確定', variant: 'success' },
  pending_store: { label: '店舗確認中', variant: 'purple' },
  no_show: { label: '無断キャンセル', variant: 'destructive' },
  checked_in: { label: 'チェックイン', variant: 'info' },
  completed: { label: '完了', variant: 'outline' },
}

export function getReservationStatusConfig(status: string): StatusConfig {
  return RESERVATION_STATUS_CONFIG[status] ?? { label: status, variant: 'outline' }
}

/**
 * 貸切リクエストのステータス表示（ラベルは貸切ドメインの文言）
 *
 * @param wasConfirmed 一度承認された後のキャンセルか（承認者の有無で判定）
 */
export function getPrivateBookingStatusConfig(
  status: string,
  wasConfirmed?: boolean
): StatusConfig | null {
  switch (status) {
    case 'pending':
    case 'pending_gm':
      return { label: 'GM確認待ち', variant: 'warning' }
    case 'gm_confirmed':
    case 'pending_store':
      return { label: '店舗確認待ち', variant: 'info' }
    case 'confirmed':
      return { label: '承認済み', variant: 'success' }
    case 'cancelled':
      return wasConfirmed
        ? { label: '確定後キャンセル', variant: 'cancelled' }
        : { label: '却下', variant: 'gray' }
    default:
      return null
  }
}

/**
 * 顧客向け貸切ステータスラベル（GM 等の内部役割名を出さない）
 * スタッフ向けは getPrivateBookingStatusConfig を使うこと
 */
export const CUSTOMER_PRIVATE_BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: '確認待ち',
  pending_gm: '確認待ち',
  gm_confirmed: '店舗確認中',
  pending_store: '店舗確認中',
  confirmed: '日程確定',
  cancelled: 'キャンセル済み',
}

export function getCustomerPrivateBookingStatusLabel(status: string): string {
  return CUSTOMER_PRIVATE_BOOKING_STATUS_LABELS[status] ?? '調整中'
}

/** 顧客向け貸切・日程調整中の説明文（内部工程を出さない） */
export function getCustomerPrivateBookingStatusDescription(status: string): string {
  switch (status) {
    case 'pending':
    case 'pending_gm':
      return '日程の空き状況を確認中です。確定次第ご連絡いたします。'
    case 'gm_confirmed':
    case 'pending_store':
      return '店舗・日程の最終確認中です。確定次第ご連絡いたします。'
    default:
      return ''
  }
}
