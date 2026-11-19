import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { RenewalSection } from '@/components/renewal/RenewalSection'
import { isPublicRegularStore, storeShortDisplayName } from '@/lib/publicStoreName'
import type { PublicStoreRow } from '../../hooks/useBookingData'

/**
 * 店舗とアクセス（刷新版）。常設の公開店舗ごとに「店舗名」と住所の行、押すと地図を開く。
 * 住所の無い店舗は出さない。組織トップではフッターのアクセスを出さず、ここにまとめる（同じ内容が 2 回出ないように）。
 */
export function StoreAccessSection({ stores, contactPath }: { stores: PublicStoreRow[]; contactPath: string }) {
  const shown = stores.filter((s) => isPublicRegularStore(s) && !!s.address)
  if (shown.length === 0) return null
  return (
    <RenewalSection id="store-access" title="店舗とアクセス">
      <ul className="divide-y divide-gray-200 border-y border-gray-200">
        {shown.map((s) => (
          <li key={s.id}>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address!)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 py-3.5 hover:bg-white/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold">{storeShortDisplayName(s)}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.address}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      {/* 店舗への連絡は問い合わせフォーム（電話番号は出さない。社長決定 2026-10-11） */}
      <Link to={contactPath} className="mt-4 inline-block text-sm underline underline-offset-4" data-testid="footer-contact-store">店舗に問い合わせる</Link>
      <p className="mt-1 text-xs text-muted-foreground">ご予約中の公演についてはマイページの予約詳細の「店舗に問い合わせる」から送ると、予約番号が入ります。</p>
    </RenewalSection>
  )
}
