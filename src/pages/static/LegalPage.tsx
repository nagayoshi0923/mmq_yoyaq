/**
 * 特定商取引法に基づく表記ページ
 * @path /legal
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Scale, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'


export function LegalPage() {
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
            <span>特定商取引法に基づく表記</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Scale className="w-8 h-8" />
            特定商取引法に基づく表記
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white border border-gray-200 overflow-hidden">
          <table className="w-full">
            <tbody className="divide-y divide-gray-200">
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900 w-1/3">
                  サービス名
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  MMQ（Murder Mystery Quest）
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  運営
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  Queens Waltz
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  お問い合わせ
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <Link to="/contact" className="text-red-600 hover:underline">お問い合わせフォーム</Link>よりご連絡ください
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  販売URL
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  https://mmq-yoyaq.vercel.app
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  販売価格
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  各シナリオ・公演ごとに表示される価格に準じます。<br />
                  価格は税込表示です。
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  商品代金以外の必要料金
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  なし<br />
                  <span className="text-gray-500 text-xs">※インターネット接続料金、通信料金はお客様のご負担となります</span>
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  支払方法
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <ul className="list-disc pl-4 space-y-1">
                    <li>クレジットカード決済</li>
                    <li>店頭での現金決済</li>
                  </ul>
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  支払時期
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  予約確定時または来店時
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  サービス提供時期
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  予約いただいた公演日時にサービスを提供いたします。
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  返品・キャンセルについて
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <p className="mb-2">
                    予約のキャンセルは、各店舗の定めるキャンセルポリシーに従います。
                  </p>
                  <p className="text-gray-500 text-xs">
                    詳細は<Link to="/cancel-policy" className="text-red-600 hover:underline">キャンセルポリシー</Link>をご確認ください。
                  </p>
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  動作環境
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <p className="mb-2">推奨ブラウザ:</p>
                  <ul className="list-disc pl-4 space-y-1 text-gray-500">
                    <li>Google Chrome 最新版</li>
                    <li>Safari 最新版</li>
                    <li>Firefox 最新版</li>
                    <li>Microsoft Edge 最新版</li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </PublicLayout>
  )
}

