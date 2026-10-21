/**
 * 貸切を受け付ける範囲（今日から何日先まで申し込めるか）がまだ分からないときの案内（Codex 点検 不具合 5）。
 * 読み込み中は「受付範囲を確認しています」、読めなかったときは再試行ボタンを出す。分かっていれば何も出さない。
 * 分からない間は、呼び出し側で日付・候補の選択と申込ボタンを止める（usePrivateBookingHorizonDays の days が null）。
 */
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PRIVATE_BOOKING_HORIZON_CHECKING_TEXT,
  PRIVATE_BOOKING_HORIZON_FAILED_TEXT,
  type PrivateBookingHorizonState,
} from '@/lib/privateBookingHorizon'

export function PrivateBookingHorizonNotice({ horizon, className = '' }: { horizon: PrivateBookingHorizonState; className?: string }) {
  if (horizon.days !== null) return null
  if (!horizon.failed) {
    return (
      <p role="status" className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`} data-testid="private-booking-horizon-checking">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {PRIVATE_BOOKING_HORIZON_CHECKING_TEXT}
      </p>
    )
  }
  return (
    <div role="alert" className={`space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className}`} data-testid="private-booking-horizon-failed">
      <p>{PRIVATE_BOOKING_HORIZON_FAILED_TEXT}</p>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={horizon.retry} data-testid="private-booking-horizon-retry">
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        再試行
      </Button>
    </div>
  )
}
