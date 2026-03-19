/**
 * 初めての方へ / 使い方ガイドページ
 * @path /guide
 * 組織トップのHowToUseGuideと同じ内容を表示
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { 
  BookOpen, ChevronRight, Calendar, Clock, Users, HelpCircle, ArrowRight
} from 'lucide-react'
import { Link } from 'react-router-dom'

export function GuidePage() {
  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-12 md:py-16"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-64 h-64 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div className="max-w-2xl mx-auto px-4 relative text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-4">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>使い方</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <HelpCircle className="w-8 h-8" />
            ご予約ガイド
          </h1>
          <p className="text-lg text-white/90">
            かんたん3ステップで予約できます
          </p>
        </div>
      </section>

      {/* ステップ説明 */}
      <section className="max-w-2xl mx-auto px-4 py-12">
        <div className="space-y-0">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div 
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: THEME.primary }}
              >
                1
              </div>
              <div className="w-0.5 flex-1 bg-gray-200 my-2" />
            </div>
            <div className="pb-8">
              <h3 className="font-bold text-lg text-gray-900">シナリオを探す</h3>
              <p className="text-gray-600 mt-2 leading-relaxed">
                「ラインナップ」タブでシナリオ一覧から選べます。
                <br />
                「カレンダー」タブでは日程から空き状況を確認できます。
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div 
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: THEME.primary }}
              >
                2
              </div>
              <div className="w-0.5 flex-1 bg-gray-200 my-2" />
            </div>
            <div className="pb-8">
              <h3 className="font-bold text-lg text-gray-900">公演を選んで予約</h3>
              <p className="text-gray-600 mt-2 leading-relaxed">
                シナリオ詳細ページから参加したい日程・人数を選択します。
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div 
                className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: THEME.primary }}
              >
                3
              </div>
            </div>
            <div className="pb-4">
              <h3 className="font-bold text-lg text-gray-900">予約完了！</h3>
              <p className="text-gray-600 mt-2 leading-relaxed">
                お名前・連絡先を入力して送信。確認メールが届きます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 便利機能 */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">便利な機能</h2>
          <div className="bg-white border border-gray-200 divide-y divide-gray-200">
            <div className="px-4 py-4 flex items-start gap-3">
              <Calendar className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">カレンダーで空き確認</p>
                <p className="text-sm text-gray-500 mt-1">店舗プルダウンで絞り込むと、その店舗の空き枠と貸切可能な日時が表示されます</p>
              </div>
            </div>
            <div className="px-4 py-4 flex items-start gap-3">
              <Users className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">貸切予約</p>
                <p className="text-sm text-gray-500 mt-1">お好きなシナリオを、お仲間だけで楽しめるプランです。カレンダーの空き枠にある「貸切申込」ボタンから日時・店舗を選んでリクエストできます</p>
              </div>
            </div>
            <div className="px-4 py-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">キャンセル待ち</p>
                <p className="text-sm text-gray-500 mt-1">満席の公演でもキャンセル待ち登録ができます</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <Link to="/">
            <Button
              size="lg"
              className="px-8"
              style={{ backgroundColor: THEME.primary, borderRadius: 0 }}
            >
              シナリオを探す
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
