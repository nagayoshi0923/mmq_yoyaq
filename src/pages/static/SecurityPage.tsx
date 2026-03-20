/**
 * セキュリティ・データ保護（公開向け要約）
 * 技術詳細は docs/security-features.md（内部用）を参照
 * @path /security
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Lock, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function SecurityPage() {
  return (
    <PublicLayout>
      <section
        className="relative overflow-hidden py-12"
        style={{ backgroundColor: THEME.primary }}
      >
        <div
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)',
          }}
        />
        <div className="max-w-4xl mx-auto px-4 relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <Link to="/" className="hover:text-white transition-colors">
              ホーム
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span>セキュリティ・データ保護</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Lock className="w-8 h-8" />
            セキュリティ・データ保護
          </h1>
          <p className="text-white/90 text-sm mt-3 max-w-2xl">
            お客様の情報を守るための取り組みの概要です。個人情報の取り扱いの詳細は
            <Link to="/privacy" className="underline mx-1">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-8">最終更新日: 2026年3月20日</p>

          <div className="space-y-8">
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                通信の保護
              </h2>
              <p className="text-gray-700 leading-relaxed">
                ブラウザと当サービス間の通信は、業界標準の暗号化（HTTPS）により保護されています。第三者による通信の盗聴や改ざんを防ぐための仕組みです。
              </p>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                アクセス制御
              </h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                アカウントには権限（管理者・スタッフ・お客様など）を設け、必要な人だけが管理機能やデータにアクセスできるよう制御しています。
              </p>
              <p className="text-gray-700 leading-relaxed">
                データベース側でも、ログイン状態に応じたアクセス制限（行レベルセキュリティ）を用い、組織ごとのデータの分離を行っています。
              </p>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                運用上の取り組み
              </h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>機密性の高い鍵情報は公開されたコードや画面に含めない設計としています。</li>
                <li>システムの一部では、不正利用の抑制のためリクエスト回数の制限を設けています。</li>
                <li>重要な操作の記録（監査ログ）を残すなど、トレーサビリティの確保に努めています。</li>
              </ul>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                継続的な改善
              </h2>
              <p className="text-gray-700 leading-relaxed">
                セキュリティは一度設定すれば完了するものではありません。機能追加や外部サービスの更新に合わせ、設定と実装の見直しを継続します。
              </p>
            </article>

            <article className="rounded-lg border border-gray-200 bg-gray-50 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-3">お問い合わせ</h2>
              <p className="text-gray-700 text-sm leading-relaxed mb-4">
                セキュリティやデータ保護に関するご質問・ご相談は、お問い合わせフォームよりご連絡ください。法人様向けの詳細資料のご用意が必要な場合も、内容に応じて個別にご案内いたします。
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center text-sm font-medium underline"
                style={{ color: THEME.primary }}
              >
                お問い合わせフォームへ
              </Link>
            </article>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
