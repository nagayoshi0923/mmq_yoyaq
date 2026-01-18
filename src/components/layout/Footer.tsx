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

  // 組織ページ用フッター
  if (organizationSlug) {
    return (
      <footer className="bg-gray-900 text-gray-300">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 組織情報 */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl font-bold text-white">
                  {organizationName || organizationSlug}
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                マーダーミステリー専門店
              </p>
              <p className="text-xs text-gray-500">
                Powered by{' '}
                <Link to="/" className="hover:text-white transition-colors" style={{ color: THEME.primary }}>
                  MMQ
                </Link>
              </p>
            </div>

            {/* ご利用案内 */}
            <div>
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                ご利用案内
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link to={`/${organizationSlug}`} className="text-sm hover:text-white transition-colors">
                    シナリオを探す
                  </Link>
                </li>
                <li>
                  <Link to="/guide" className="text-sm hover:text-white transition-colors">
                    初めての方へ
                  </Link>
                </li>
              </ul>
            </div>

            {/* サポート */}
            <div>
              <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                サポート
              </h3>
              <ul className="space-y-3">
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
                <li>
                  <Link to={`/org/${organizationSlug}/contact`} className="text-sm hover:text-white transition-colors">
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* コピーライト行 + 法的情報 */}
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                © {currentYear} MMQ. All rights reserved.
              </p>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <Link to="/terms" className="hover:text-gray-300 transition-colors">利用規約</Link>
                <Link to="/privacy" className="hover:text-gray-300 transition-colors">プライバシー</Link>
                <Link to="/contact" className="hover:text-gray-300 transition-colors">MMQへ問い合わせ</Link>
              </div>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // プラットフォーム用フッター（シンプル版 - コピーライト行のみ）
  return (
    <footer className="bg-black">
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
            <p className="text-sm text-gray-500">
              © {currentYear} MMQ. All rights reserved.
            </p>
          </div>
          
          {/* リンク */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
            <Link to="/stores" className="hover:text-gray-300 transition-colors">参加団体</Link>
            <Link to="/guide" className="hover:text-gray-300 transition-colors">初めての方へ</Link>
            <Link to="/faq" className="hover:text-gray-300 transition-colors">よくある質問</Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">利用規約</Link>
            <Link to="/privacy" className="hover:text-gray-300 transition-colors">プライバシー</Link>
            <Link to="/contact" className="hover:text-gray-300 transition-colors">お問い合わせ</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

