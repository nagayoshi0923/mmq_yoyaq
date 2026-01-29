/**
 * キャンセルポリシーページ
 * @path /cancel-policy
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { AlertTriangle, ChevronRight, Clock, Info } from 'lucide-react'
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
            <AlertTriangle className="w-8 h-8" />
            キャンセルポリシー
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-8">
            最終更新日: 2026年1月1日
          </p>

          <div className="space-y-8">
            {/* お客様都合のキャンセル */}
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                お客様都合によるキャンセル
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  ご予約のキャンセルは、マイページから行うことができます。
                  キャンセル時期によって、以下のキャンセル料が発生します。
                </p>
                
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold">キャンセル時期</th>
                        <th className="text-right py-2 font-semibold">キャンセル料</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2">公演開始24時間前まで</td>
                        <td className="text-right py-2 text-green-600 font-medium">無料</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2">公演開始24時間前〜当日</td>
                        <td className="text-right py-2 text-amber-600 font-medium">参加料金の50%</td>
                      </tr>
                      <tr>
                        <td className="py-2">公演開始後・無断キャンセル</td>
                        <td className="text-right py-2 text-red-600 font-medium">参加料金の100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-gray-500">
                  ※ 貸切公演の場合は、別途貸切料金に対するキャンセル料が発生する場合があります。
                </p>
              </div>
            </article>

            {/* 主催者都合のキャンセル */}
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

              {/* 中止判定タイミング */}
              <div className="mt-6 bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  中止判定のタイミング
                </h4>
                <div className="text-amber-800 space-y-2 text-sm">
                  <p><strong>■ 前日 23:59 時点での判定</strong></p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>定員の過半数に満たない場合 → <span className="font-medium text-red-700">中止</span></li>
                    <li>過半数以上だが満席でない場合 → 公演4時間前まで募集を延長</li>
                    <li>満席の場合 → 開催確定</li>
                  </ul>
                  <p className="mt-3"><strong>■ 延長された場合（公演4時間前）</strong></p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>満席でない場合 → <span className="font-medium text-red-700">中止</span></li>
                  </ul>
                </div>
              </div>

              {/* 中止連絡 */}
              <div className="mt-4 bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  中止時のご連絡
                </h4>
                <div className="text-blue-800 space-y-2 text-sm">
                  <ul className="list-disc pl-6 space-y-1">
                    <li>中止が決定した場合、ご登録のメールアドレスに自動でお知らせします</li>
                    <li>中止の場合、参加料金は一切発生しません</li>
                  </ul>
                </div>
              </div>
            </article>

            {/* 予約変更 */}
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                予約内容の変更
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  参加人数の変更は、マイページから公演開始24時間前まで無料で行えます。
                </p>
                <p>
                  日程の変更をご希望の場合は、一度キャンセルの上、再度ご予約をお願いいたします。
                  この場合、キャンセル時期によってキャンセル料が発生する場合があります。
                </p>
              </div>
            </article>

            {/* 返金方法 */}
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                返金について
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  当日現地決済のため、事前にお支払いいただく金額はありません。
                  キャンセル料が発生した場合は、次回ご来店時にお支払いいただくか、
                  別途ご連絡させていただきます。
                </p>
              </div>
            </article>

            {/* お問い合わせ */}
            <article>
              <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b">
                お問い合わせ
              </h2>
              <div className="text-gray-700 space-y-3">
                <p>
                  キャンセルに関するご質問・ご相談は、
                  <Link to="/contact" className="text-blue-600 hover:underline">お問い合わせフォーム</Link>
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
