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
