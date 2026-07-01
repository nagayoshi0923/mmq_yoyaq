import { Badge } from '@/components/ui/badge'
import {
  getPrivateBookingStatusConfig,
  getReservationStatusConfig,
} from '@/lib/constants/reservationStatus'
import { cn } from '@/lib/utils'

interface ReservationStatusBadgeProps {
  status: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * 予約ステータスバッジ（一元マップ lib/constants/reservationStatus.ts を描画）
 */
export function ReservationStatusBadge({ status, size = 'md', className }: ReservationStatusBadgeProps) {
  const config = getReservationStatusConfig(status)
  return (
    <Badge variant={config.variant} size={size} className={cn('whitespace-nowrap', className)}>
      {config.label}
    </Badge>
  )
}

interface PrivateBookingStatusBadgeProps {
  status: string
  /** 一度承認された後のキャンセルか（承認者の有無で判定） */
  wasConfirmed?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * 貸切リクエストのステータスバッジ（貸切ドメインの文言 + 意味色）
 */
export function PrivateBookingStatusBadge({
  status,
  wasConfirmed,
  size = 'md',
  className,
}: PrivateBookingStatusBadgeProps) {
  const config = getPrivateBookingStatusConfig(status, wasConfirmed)
  if (!config) return null
  return (
    <Badge variant={config.variant} size={size} className={cn('whitespace-nowrap', className)}>
      {config.label}
    </Badge>
  )
}
