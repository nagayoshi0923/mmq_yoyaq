/**
 * キャンセルポリシーページ
 * @path /cancel-policy
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { CalendarX2, ChevronRight, AlertTriangle, Info } from 'lucide-react'
import { Link } from 'react-router-dom'

export function CancelPolicyPage() {
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
            <span>キャンセルポリシー</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <CalendarX2 className="w-8 h-8" />
            キャンセルポリシー
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        {/* 重要事項 */}
        <div className="bg-red-50 border border-red-200 p-6 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-900 mb-2">キャンセルについての重要事項</h3>
              <p className="text-red-800">
                マーダーミステリーは参加者全員が揃って初めて成立するゲームです。<br />
                キャンセルは他の参加者様にも影響を与えますので、予約の際は日程をよくご確認ください。
              </p>
            </div>
          </div>
        </div>

        <div className="prose prose-gray max-w-none">
          <div className="space-y-8">
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                基本キャンセル規定
              </h2>
              <p className="text-gray-700 mb-4">
                キャンセル料は、予約の公演開始時刻を基準に、以下の通り発生します。
              </p>
              
              {/* キャンセル料テーブル */}
              <div className="bg-white border border-gray-200 overflow-hidden mb-6">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">キャンセル時期</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">キャンセル料</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-700">7日前まで</td>
                      <td className="px-6 py-4 text-sm text-green-600 font-medium">無料</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-700">6日前〜3日前</td>
                      <td className="px-6 py-4 text-sm text-amber-600 font-medium">参加料金の30%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-700">2日前〜前日</td>
                      <td className="px-6 py-4 text-sm text-orange-600 font-medium">参加料金の50%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-700">当日</td>
                      <td className="px-6 py-4 text-sm text-red-600 font-medium">参加料金の100%</td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-sm text-gray-700">無断キャンセル</td>
                      <td className="px-6 py-4 text-sm text-red-600 font-medium">参加料金の100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    上記は標準的なキャンセルポリシーです。店舗によって異なる場合がありますので、
                    予約時に表示されるキャンセルポリシーを必ずご確認ください。
                  </p>
                </div>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                キャンセル方法
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>予約のキャンセルは以下の方法で行えます：</p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>マイページにログイン</li>
                  <li>「予約一覧」から該当の予約を選択</li>
                  <li>「キャンセル」ボタンをクリック</li>
                  <li>確認画面で「キャンセルを確定」</li>
                </ol>
                <p className="text-sm text-gray-500 mt-4">
                  ※システムから自動的にキャンセル完了メールが送信されます。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                予約の変更について
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  日程や人数の変更は、一度キャンセルした上で再予約していただく形となります。
                </p>
                <p>
                  空き状況によっては希望の日時への変更ができない場合がありますので、予めご了承ください。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                貸切予約のキャンセルについて
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  貸切予約のキャンセルには、通常の予約とは異なるキャンセル料が適用される場合があります。
                </p>
                <p>
                  詳細は予約時に表示されるキャンセルポリシーをご確認ください。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                主催者側の都合によるキャンセル
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  以下の場合、主催者側の判断により公演がキャンセルとなることがあります：
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>最少催行人数に満たない場合</li>
                  <li>自然災害、感染症の流行など不可抗力の場合</li>
                  <li>店舗の都合によるやむを得ない事情がある場合</li>
                </ul>
                <p className="mt-4">
                  この場合、参加料金は全額返金いたします。
                </p>
              </div>
            </article>

            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                返金方法
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  キャンセル時の返金は、お支払い方法に応じて以下の通り処理されます：
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>クレジットカード決済の場合:</strong> カード会社経由で返金（1〜2週間程度）</li>
                  <li><strong>当日現金払いの予約:</strong> キャンセル料のみ請求</li>
                </ul>
              </div>
            </article>
          </div>
        </div>

        {/* お問い合わせ誘導 */}
        <div className="mt-12 p-6 bg-gray-50 border border-gray-200 text-center">
          <p className="text-gray-600 mb-4">
            キャンセルについてご不明な点がございましたら、お気軽にお問い合わせください。
          </p>
          <Link to="/contact">
            <button
              className="px-6 py-2 text-white font-medium transition-colors hover:opacity-90"
              style={{ backgroundColor: THEME.primary }}
            >
              お問い合わせ
            </button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}

