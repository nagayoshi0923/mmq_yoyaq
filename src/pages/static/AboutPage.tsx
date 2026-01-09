/**
 * 運営会社情報ページ
 * @path /about
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Building, ChevronRight, Mail, MapPin, Globe } from 'lucide-react'
import { Link } from 'react-router-dom'

export function AboutPage() {
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
            <span>運営会社</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Building className="w-8 h-8" />
            運営会社
          </h1>
        </div>
      </section>

      {/* コンテンツ */}
      <section className="max-w-4xl mx-auto px-4 py-12">
        {/* 会社概要 */}
        <div className="bg-white border border-gray-200 overflow-hidden mb-12">
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
                  サービス開始
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  2024年
                </td>
              </tr>
              <tr>
                <th className="bg-gray-50 px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  事業内容
                </th>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <ul className="list-disc pl-4 space-y-1">
                    <li>マーダーミステリー予約プラットフォームの運営</li>
                    <li>店舗管理システムの開発・提供</li>
                  </ul>
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
            </tbody>
          </table>
        </div>

        {/* ミッション */}
        <div className="mb-12">
          <h2 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b flex items-center gap-2">
            <span 
              className="w-1 h-6"
              style={{ backgroundColor: THEME.primary }}
            />
            ミッション
          </h2>
          <div className="bg-gray-50 p-8 text-center">
            <p className="text-xl text-gray-700 font-medium leading-relaxed">
              「マーダーミステリーの素晴らしい体験を、<br />
              より多くの人に届ける」
            </p>
          </div>
          <p className="text-gray-600 mt-6 leading-relaxed">
            私たちは、マーダーミステリーという素晴らしいエンターテインメントを
            より多くの人に知ってもらい、体験してもらうことを目指しています。
            <br /><br />
            店舗運営者様には使いやすい管理ツールを提供し、
            プレイヤーの皆様には簡単にシナリオを探して予約できるプラットフォームを提供することで、
            マーダーミステリー業界全体の発展に貢献します。
          </p>
        </div>

        {/* お問い合わせ */}
        <div className="bg-gray-50 p-8 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-6 text-center">
            お問い合わせ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link 
              to="/contact"
              className="flex flex-col items-center p-6 bg-white border border-gray-200 hover:shadow-md transition-shadow"
            >
              <Mail className="w-8 h-8 mb-3" style={{ color: THEME.primary }} />
              <span className="font-medium text-gray-900">お問い合わせ</span>
              <span className="text-sm text-gray-500 mt-1">フォームから送信</span>
            </Link>
            <Link 
              to="/faq"
              className="flex flex-col items-center p-6 bg-white border border-gray-200 hover:shadow-md transition-shadow"
            >
              <MapPin className="w-8 h-8 mb-3" style={{ color: THEME.primary }} />
              <span className="font-medium text-gray-900">よくある質問</span>
              <span className="text-sm text-gray-500 mt-1 text-center">FAQを確認</span>
            </Link>
            <Link 
              to="/"
              className="flex flex-col items-center p-6 bg-white border border-gray-200 hover:shadow-md transition-shadow"
            >
              <Globe className="w-8 h-8 mb-3" style={{ color: THEME.primary }} />
              <span className="font-medium text-gray-900">サービストップ</span>
              <span className="text-sm text-gray-500 mt-1">MMQを見る</span>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

