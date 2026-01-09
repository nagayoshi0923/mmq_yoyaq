/**
 * 利用規約ページ
 * @path /terms
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { FileText, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function TermsPage() {
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
            <span>利用規約</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="w-8 h-8" />
            利用規約
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
                第1条（適用）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  本利用規約（以下「本規約」）は、Murder Mystery Quest（以下「当サービス」）の利用に関する条件を定めるものです。
                </p>
                <p>
                  ユーザーは本規約に同意の上、当サービスを利用するものとします。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第2条（利用登録）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  登録希望者が当サービスの定める方法によって利用登録を申請し、当サービスがこれを承認することによって、利用登録が完了するものとします。
                </p>
                <p>
                  当サービスは、以下の場合に利用登録の申請を承認しないことがあります：
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>虚偽の事項を届け出た場合</li>
                  <li>本規約に違反したことがある者からの申請である場合</li>
                  <li>その他、当サービスが利用登録を相当でないと判断した場合</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第3条（禁止事項）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>ユーザーは、以下の行為をしてはなりません：</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>法令または公序良俗に違反する行為</li>
                  <li>犯罪行為に関連する行為</li>
                  <li>当サービスのサーバーまたはネットワークの機能を破壊したり、妨害したりする行為</li>
                  <li>当サービスの運営を妨害するおそれのある行為</li>
                  <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
                  <li>他のユーザーに成りすます行為</li>
                  <li>当サービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為</li>
                  <li>その他、当サービスが不適切と判断する行為</li>
                </ul>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第4条（予約・キャンセル）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  予約の成立およびキャンセルに関しては、各店舗が定めるポリシーに従うものとします。
                </p>
                <p>
                  キャンセル料が発生する場合がありますので、各店舗の規定をご確認ください。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第5条（サービス内容の変更等）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスは、ユーザーに通知することなく、サービスの内容を変更しまたはサービスの提供を中止することができるものとし、これによってユーザーに生じた損害について一切の責任を負いません。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第6条（利用規約の変更）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当サービスは、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができるものとします。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                第7条（準拠法・裁判管轄）
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  本規約の解釈にあたっては、日本法を準拠法とします。
                </p>
                <p>
                  当サービスに関して紛争が生じた場合には、当サービスの所在地を管轄する裁判所を専属的合意管轄とします。
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

