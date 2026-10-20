/**
 * マイページのクーポンの「使える店舗」。全店舗のクーポンは「○○の全店舗（地域）」を押すと店舗名の一覧が開く。
 * 店舗数は出さない（予約サイトのトップの店舗数と数え方が違って食い違うため。2026-10-12）。
 */
import { useState } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import { COUPON_USABLE_STORES_PENDING_LABEL } from '@/lib/couponUsableStores'

interface CouponUsableStoresProps {
  label: string
  storeNames?: string[] | null
}

export function CouponUsableStores({ label, storeNames }: CouponUsableStoresProps) {
  const [open, setOpen] = useState(false)
  const names = storeNames ?? []
  if (names.length === 0) {
    return (
      <p className="mt-2 flex items-start gap-1 ts-body text-foreground" data-testid="coupon-usable-stores">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{label === COUPON_USABLE_STORES_PENDING_LABEL ? label : `使える店舗: ${label}`}</span>
      </p>
    )
  }
  return (
    <div className="mt-2" data-testid="coupon-usable-stores" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className="flex items-start gap-1 ts-body text-foreground text-left min-h-11 sm:min-h-0"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          使える店舗: <span className="underline underline-offset-2">{label}</span>
        </span>
        <ChevronDown className={`w-4 h-4 mt-0.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-1 ml-5 ts-body text-muted-foreground list-disc pl-4" data-testid="coupon-usable-store-names">
          {names.map(name => <li key={name}>{name}</li>)}
        </ul>
      )}
    </div>
  )
}
