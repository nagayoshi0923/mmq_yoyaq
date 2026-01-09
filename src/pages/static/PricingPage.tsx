/**
 * 料金プランページ
 * @path /pricing
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CreditCard, ChevronRight, CheckCircle, HelpCircle, 
  Zap, ArrowRight, Building2, Users, Calendar
} from 'lucide-react'
import { Link } from 'react-router-dom'

const PLANS = [
  {
    name: '管理サイト',
    price: '¥0',
    period: '',
    description: '管理機能はずっと無料',
    features: [
      { text: 'スケジュール管理', included: true },
      { text: 'スタッフ・GM管理', included: true },
      { text: 'シナリオ管理', included: true },
      { text: '売上・分析レポート', included: true },
      { text: 'Discord通知', included: true },
      { text: 'ライセンス報告', included: true },
      { text: '店舗・スタッフ数 無制限', included: true },
      { text: 'オンライン予約受付', included: false },
      { text: '顧客へのメール自動送信', included: false },
    ],
    buttonText: '無料で始める',
    buttonVariant: 'outline' as const,
    popular: false,
    color: 'gray',
  },
  {
    name: '予約サイト公開',
    price: '¥4,980',
    period: '/月',
    description: '予約受付を始めたい方に',
    features: [
      { text: '管理サイトの全機能', included: true },
      { text: '24時間オンライン予約受付', included: true },
      { text: '顧客への自動メール送信', included: true },
      { text: '予約サイトのカスタマイズ', included: true },
      { text: '顧客管理機能', included: true },
      { text: 'キャンセル・変更受付', included: true },
      { text: '貸切予約受付', included: true },
    ],
    buttonText: '予約サイトを公開する',
    buttonVariant: 'default' as const,
    popular: true,
    color: 'primary',
  },
]

const FAQ_ITEMS = [
  {
    q: '管理サイトは本当にずっと無料ですか？',
    a: 'はい、管理サイトの機能（スケジュール管理、スタッフ管理、売上管理など）は永久無料です。店舗数やスタッフ数の制限もありません。',
  },
  {
    q: '予約サイトを公開しなくても使えますか？',
    a: 'はい、予約サイトを公開せずに管理機能だけを無料でお使いいただけます。予約受付が必要になったタイミングで有料プランをご検討ください。',
  },
  {
    q: '予約サイト公開はいつでも解約できますか？',
    a: 'はい、いつでも解約可能です。解約後も管理サイトの機能は引き続き無料でご利用いただけます。',
  },
  {
    q: '支払い方法は何がありますか？',
    a: 'クレジットカード（Visa, Mastercard, JCB, American Express）に対応しています。',
  },
]

export function PricingPage() {
  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-16"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-64 h-64 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="max-w-5xl mx-auto px-4 relative text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-4">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>料金プラン</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center justify-center gap-3 mb-4">
            <CreditCard className="w-10 h-10" />
            料金プラン
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            シンプルで分かりやすい料金体系。<br />
            まずは無料プランからお試しください。
          </p>
        </div>
      </section>

      {/* プラン一覧 */}
      <section className="max-w-4xl mx-auto px-4 py-16 -mt-8">
        <div className="grid md:grid-cols-2 gap-8">
          {PLANS.map((plan) => (
            <Card 
              key={plan.name}
              className={`relative border-2 ${
                plan.popular 
                  ? 'border-red-500 shadow-xl scale-105' 
                  : 'border-gray-200'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge 
                    className="px-4 py-1 text-white"
                    style={{ backgroundColor: THEME.primary }}
                  >
                    人気No.1
                  </Badge>
                </div>
              )}
              <CardContent className="p-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold" style={{ color: plan.popular ? THEME.primary : '#111' }}>
                      {plan.price}
                    </span>
                    <span className="text-gray-500">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, idx) => (
                    <li 
                      key={idx} 
                      className={`flex items-center gap-2 text-sm ${
                        feature.included ? 'text-gray-700' : 'text-gray-400'
                      }`}
                    >
                      <CheckCircle 
                        className={`w-4 h-4 flex-shrink-0 ${
                          feature.included ? 'text-green-500' : 'text-gray-300'
                        }`} 
                      />
                      {feature.text}
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.buttonVariant}
                  style={plan.popular ? { backgroundColor: THEME.primary, borderRadius: 0 } : { borderRadius: 0 }}
                  onClick={() => window.location.href = '/register'}
                >
                  {plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 比較表 */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            プラン比較
          </h2>
          <div className="bg-white border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">機能</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">管理サイト<br /><span className="text-xs font-normal text-gray-500">無料</span></th>
                  <th className="px-6 py-4 text-center text-sm font-semibold" style={{ color: THEME.primary }}>予約サイト公開<br /><span className="text-xs font-normal">¥4,980/月</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" /> 店舗数
                  </td>
                  <td className="px-6 py-3 text-center text-sm">無制限</td>
                  <td className="px-6 py-3 text-center text-sm font-medium" style={{ color: THEME.primary }}>無制限</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" /> スタッフ数
                  </td>
                  <td className="px-6 py-3 text-center text-sm">無制限</td>
                  <td className="px-6 py-3 text-center text-sm font-medium" style={{ color: THEME.primary }}>無制限</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">スケジュール管理</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">スタッフ・GM管理</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">シナリオ管理</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">売上・分析レポート</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">Discord通知</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-sm text-gray-700">ライセンス報告</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-amber-50/50">
                  <td className="px-6 py-3 text-sm text-gray-700 font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" /> オンライン予約受付
                  </td>
                  <td className="px-6 py-3 text-center text-gray-300">—</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-amber-50/50">
                  <td className="px-6 py-3 text-sm text-gray-700 font-medium">顧客へのメール自動送信</td>
                  <td className="px-6 py-3 text-center text-gray-300">—</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-amber-50/50">
                  <td className="px-6 py-3 text-sm text-gray-700 font-medium">予約サイトカスタマイズ</td>
                  <td className="px-6 py-3 text-center text-gray-300">—</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
                <tr className="bg-amber-50/50">
                  <td className="px-6 py-3 text-sm text-gray-700 font-medium">顧客管理</td>
                  <td className="px-6 py-3 text-center text-gray-300">—</td>
                  <td className="px-6 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-500 mx-auto" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8 flex items-center justify-center gap-2">
          <HelpCircle className="w-6 h-6" style={{ color: THEME.primary }} />
          よくある質問
        </h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className="border border-gray-200 p-6 bg-white">
              <h3 className="font-semibold text-gray-900 mb-2">Q. {item.q}</h3>
              <p className="text-gray-600">A. {item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4">
          <div 
            className="relative overflow-hidden p-12 text-center text-white"
            style={{ backgroundColor: THEME.primary }}
          >
            <div 
              className="absolute top-0 right-0 w-64 h-full"
              style={{ background: `linear-gradient(90deg, transparent 0%, ${THEME.accent}30 100%)` }}
            />
            <div className="relative">
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-90" />
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                まずは無料で始めましょう
              </h2>
              <p className="opacity-90 mb-8 max-w-lg mx-auto">
                クレジットカード不要。30秒で登録完了。<br />
                いつでもアップグレードできます。
              </p>
              <Button
                size="lg"
                className="bg-white hover:bg-gray-100 px-8"
                style={{ color: THEME.primary, borderRadius: 0 }}
                onClick={() => window.location.href = '/register'}
              >
                無料で始める
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

