/**
 * 共通フッターコンポーネント
 * 全ての公開ページで使用する統一フッター
 */
import { Link } from 'react-router-dom'
import { Mail, MapPin } from 'lucide-react'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { buildPublicCancellationPolicyPath } from '@/lib/publicBookingPath'
import { storeDisplayName } from '@/lib/publicStoreName'

interface StoreInfo {
  id: string
  name: string
  short_name?: string
  address?: string
  region?: string
  is_temporary?: boolean
  status?: string
}

interface FooterProps {
  /** 組織スラッグ（組織固有ページで使用） */
  organizationSlug?: string
  /** 組織名（表示用） */
  organizationName?: string
  /** 店舗データ（住所表示用） */
  stores?: StoreInfo[]
  /** シンプル表示（最小限の情報のみ） */
  minimal?: boolean
}

export function Footer({ organizationSlug, organizationName, stores = [], minimal = false }: FooterProps) {
  const currentYear = new Date().getFullYear()
  
  if (minimal) {
    return (
      <footer className="border-t border-gray-200 bg-gray-50 text-muted-foreground py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm">© {currentYear} MMQ. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/terms" className="hover:text-foreground transition-colors">利用規約</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">プライバシーポリシー</Link>
              <Link to="/security" className="hover:text-foreground transition-colors">セキュリティ</Link>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // 組織ページ用フッター
  if (organizationSlug) {
    // 常設店舗のみ表示（臨時会場・非アクティブ除外）
    const regularStores = stores.filter(s => !s.is_temporary && s.status !== 'inactive' && s.address)
    
    return (
      <footer className="border-t border-gray-200 bg-gray-50 text-muted-foreground">
        {/* 店舗アクセス情報 */}
        {regularStores.length > 0 && (
          <div id="store-access" className="border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 py-10">
              <h3 className="text-foreground font-semibold mb-6 text-sm uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" style={{ color: THEME.accent }} />
                アクセス
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {regularStores.map(store => (
                  <a
                    key={store.id}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address!)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group p-4 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    <div className="text-foreground font-medium text-sm mb-1 group-hover:underline">
                      {storeDisplayName(store, { organizationName })}
                    </div>
                    <div className="text-muted-foreground text-xs leading-relaxed flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{store.address}</span>
                    </div>
                  </a>
                ))}
              </div>
              {/* 店舗への連絡は問い合わせフォーム（電話番号は出さない。社長決定 2026-10-11、点検 2） */}
              <Link
                to={`/org/${organizationSlug}/contact`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 border border-gray-300 bg-white px-4 text-sm text-foreground hover:bg-gray-100 transition-colors"
                data-testid="footer-contact-store"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                店舗に問い合わせる
              </Link>
              <p className="mt-2 text-xs text-muted-foreground">ご予約中の公演についてはマイページの予約詳細の「店舗に問い合わせる」から送ると、予約番号が入ります。</p>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 組織情報 */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl font-bold text-foreground">
                  {organizationName || organizationSlug}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                マーダーミステリー専門店
              </p>
              <p className="text-xs text-muted-foreground">
                Powered by{' '}
                <Link to="/" className="hover:text-foreground transition-colors" style={{ color: THEME.primary }}>
                  MMQ
                </Link>
              </p>
            </div>

            {/* ご利用案内 */}
            <div>
              <h3 className="text-foreground font-semibold mb-4 text-sm uppercase tracking-wider">
                ご利用案内
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link to={`/${organizationSlug}`} className="text-sm hover:text-foreground transition-colors">
                    シナリオを探す
                  </Link>
                </li>
                <li>
                  <Link to="/guide" className="text-sm hover:text-foreground transition-colors">
                    初めての方へ
                  </Link>
                </li>
                <li>
                  <Link to="/start" className="text-sm hover:text-foreground transition-colors">
                    店舗登録
                  </Link>
                </li>
              </ul>
            </div>

            {/* サポート */}
            <div>
              <h3 className="text-foreground font-semibold mb-4 text-sm uppercase tracking-wider">
                サポート
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link to={organizationSlug ? `/${organizationSlug}/faq` : '/faq'} className="text-sm hover:text-foreground transition-colors">
                    よくある質問
                  </Link>
                </li>
                <li>
                  <Link to={buildPublicCancellationPolicyPath(organizationSlug)} className="text-sm hover:text-foreground transition-colors">
                    キャンセルポリシー
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="text-sm hover:text-foreground transition-colors">
                    セキュリティ・データ保護
                  </Link>
                </li>
                <li>
                  <Link to={`/org/${organizationSlug}/contact`} className="text-sm hover:text-foreground transition-colors">
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* コピーライト行 + 法的情報 */}
        <div className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                © {currentYear} MMQ. All rights reserved.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 whitespace-nowrap text-sm text-muted-foreground">
                <Link to="/terms" className="hover:text-foreground transition-colors">利用規約</Link>
                <Link to="/privacy" className="hover:text-foreground transition-colors">プライバシーポリシー</Link>
                <Link to="/security" className="hover:text-foreground transition-colors">セキュリティ</Link>
                <Link to="/contact" className="hover:text-foreground transition-colors">MMQへ問い合わせ</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // プラットフォーム用フッター（シンプル版 - コピーライト行のみ）
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* ロゴ + コピーライト */}
          <div className="flex items-center gap-4">
            <span 
              className="text-xl font-bold"
              style={{ color: THEME.primary }}
            >
              MMQ
            </span>
            <p className="text-sm text-muted-foreground">
              © {currentYear} MMQ. All rights reserved.
            </p>
          </div>
          
          {/* リンク */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/stores" className="hover:text-foreground transition-colors">参加店舗一覧</Link>
            <Link to="/guide" className="hover:text-foreground transition-colors">初めての方へ</Link>
            <Link to="/faq" className="hover:text-foreground transition-colors">よくある質問</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">利用規約</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">プライバシー</Link>
            <Link to="/security" className="hover:text-foreground transition-colors">セキュリティ</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">お問い合わせ</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
