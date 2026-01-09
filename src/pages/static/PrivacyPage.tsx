/**
 * プライバシーポリシーページ
 * @path /privacy
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Shield, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-12"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-48 h-48 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="max-w-4xl mx-auto px-4 relative">
          <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>プライバシーポリシー</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Shield className="w-8 h-8" />
            プライバシーポリシー
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-8">
            最終更新日: 2024年1月1日
          </p>

          <div className="space-y-8">
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                1. 個人情報の収集について
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスでは、ユーザー登録や予約の際に、以下の個人情報を収集することがあります：
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>氏名・ニックネーム</li>
                  <li>メールアドレス</li>
                  <li>電話番号</li>
                  <li>予約履歴</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                2. 個人情報の利用目的
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>収集した個人情報は、以下の目的で利用します：</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>予約の確認・変更・キャンセルに関する連絡</li>
                  <li>サービスに関するお知らせの送信</li>
                  <li>お問い合わせへの対応</li>
                  <li>サービスの改善・新サービスの開発</li>
                  <li>統計データの作成（個人を特定できない形式）</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                3. 個人情報の第三者提供
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスは、以下の場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません：
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>法令に基づく場合</li>
                  <li>人の生命、身体または財産の保護のために必要な場合</li>
                  <li>予約先店舗への情報共有（予約遂行のため必要な範囲）</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                4. Cookieの使用について
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスでは、ユーザー体験の向上のためCookieを使用しています。
                  Cookieにより、ログイン状態の維持やお気に入り情報の保存などを行います。
                </p>
                <p>
                  ブラウザの設定でCookieを無効にすることも可能ですが、一部の機能が正常に動作しなくなる場合があります。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                5. セキュリティについて
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスは、個人情報の漏洩、紛失、改ざんを防止するため、適切なセキュリティ対策を講じています。
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>SSL/TLSによる通信の暗号化</li>
                  <li>アクセス制限による不正アクセスの防止</li>
                  <li>定期的なセキュリティ監査</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                6. 個人情報の開示・訂正・削除
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  ユーザーは、自己の個人情報について開示・訂正・削除を請求することができます。
                  ご希望の場合は、お問い合わせフォームよりご連絡ください。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                7. プライバシーポリシーの変更
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスは、必要に応じて本ポリシーを変更することがあります。
                  変更後のプライバシーポリシーは、本ページにて公開した時点から効力を生じるものとします。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                8. お問い合わせ
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  個人情報の取り扱いに関するお問い合わせは、
                  <Link to="/contact" className="text-red-600 hover:underline">お問い合わせフォーム</Link>
                  よりご連絡ください。
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

