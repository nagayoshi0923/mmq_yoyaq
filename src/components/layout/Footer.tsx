/**
 * 共通フッターコンポーネント
 * 全ての公開ページで使用する統一フッター
 */
import { Link } from 'react-router-dom'
import { MYPAGE_THEME as THEME } from '@/lib/theme'

interface FooterProps {
  /** 組織スラッグ（組織固有ページで使用） */
  organizationSlug?: string
  /** 組織名（表示用） */
  organizationName?: string
  /** シンプル表示（最小限の情報のみ） */
  minimal?: boolean
}

export function Footer({ organizationSlug, organizationName, minimal = false }: FooterProps) {
  const currentYear = new Date().getFullYear()
  
  // リンクのベースパス
  const basePath = organizationSlug ? `/${organizationSlug}` : ''

  if (minimal) {
    return (
      <footer className="bg-gray-900 text-gray-400 py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm">© {currentYear} MMQ. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm">
              <Link to="/terms" className="hover:text-white transition-colors">利用規約</Link>
              <Link to="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* メインフッター */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* ブランド・概要 */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <span 
                className="text-xl font-bold"
                style={{ color: THEME.primary }}
              >
                MMQ
              </span>
              {organizationName && (
                <>
                  <span className="text-gray-600">×</span>
                  <span className="text-white font-medium">{organizationName}</span>
                </>
              )}
            </div>
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              マーダーミステリー専門の予約プラットフォーム。<br />
              様々な店舗のシナリオを検索・予約できます。
            </p>
            {/* SNS links could go here */}
          </div>

          {/* プレイヤー向け */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              プレイヤー向け
            </h3>
            <ul className="space-y-3">
              <li>
                <Link to="/" className="text-sm hover:text-white transition-colors">
                  シナリオを探す
                </Link>
              </li>
              <li>
                <Link to="/guide" className="text-sm hover:text-white transition-colors">
                  初めての方へ
                </Link>
              </li>
              <li>
                <Link to="/stores" className="text-sm hover:text-white transition-colors">
                  店舗一覧
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-sm hover:text-white transition-colors">
                  よくある質問
                </Link>
              </li>
              <li>
                <Link to="/cancel-policy" className="text-sm hover:text-white transition-colors">
                  キャンセルポリシー
                </Link>
              </li>
            </ul>
          </div>

          {/* 店舗運営者向け */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              店舗運営者向け
            </h3>
            <ul className="space-y-3">
              <li>
                <Link to="/pricing" className="text-sm hover:text-white transition-colors">
                  料金プラン
                </Link>
              </li>
              <li>
                <Link to="/getting-started" className="text-sm hover:text-white transition-colors">
                  導入の流れ
                </Link>
              </li>
              <li>
                <Link to="/register" className="text-sm hover:text-white transition-colors">
                  無料で始める
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm hover:text-white transition-colors">
                  お問い合わせ
                </Link>
              </li>
            </ul>
          </div>

          {/* 法的情報 */}
          <div>
            <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
              法的情報
            </h3>
            <ul className="space-y-3">
              <li>
                <Link to="/terms" className="text-sm hover:text-white transition-colors">
                  利用規約
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-sm hover:text-white transition-colors">
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link to="/legal" className="text-sm hover:text-white transition-colors">
                  特定商取引法に基づく表記
                </Link>
              </li>
              <li>
                <Link to="/company" className="text-sm hover:text-white transition-colors">
                  運営会社
                </Link>
              </li>
            </ul>
          </div>
        </div>

      </div>

      {/* 区切り線 */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              © {currentYear} Murder Mystery Quest. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link to="/terms" className="hover:text-gray-300 transition-colors">利用規約</Link>
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">プライバシー</Link>
              <Link to="/contact" className="hover:text-gray-300 transition-colors">お問い合わせ</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

