/**
 * 導入の流れページ
 * @path /getting-started
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { 
  Rocket, ChevronRight, UserPlus, Settings, Calendar, 
  Globe, CheckCircle, ArrowRight, MessageCircle, Zap,
  Building2, BookOpen, Users
} from 'lucide-react'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    number: 1,
    title: 'アカウント登録',
    description: 'メールアドレスとパスワードを入力して無料アカウントを作成。30秒で完了します。',
    icon: UserPlus,
    time: '30秒',
    details: [
      'メールアドレスを入力',
      'パスワードを設定',
      '確認メールをクリック',
    ],
  },
  {
    number: 2,
    title: '組織・店舗を登録',
    description: '組織名と店舗情報を入力。住所やアクセス情報を設定すると予約サイトに表示されます。',
    icon: Building2,
    time: '5分',
    details: [
      '組織名を入力',
      '店舗の基本情報を設定',
      '営業時間・アクセス情報を追加',
    ],
  },
  {
    number: 3,
    title: 'シナリオを追加',
    description: '公演するシナリオを登録。タイトル、プレイ人数、時間、料金などを設定します。',
    icon: BookOpen,
    time: '10分',
    details: [
      'シナリオ情報を入力',
      'キービジュアルをアップロード',
      '料金・人数を設定',
    ],
  },
  {
    number: 4,
    title: 'スタッフを招待',
    description: 'GMやスタッフを招待。メールアドレスを入力するだけで招待リンクが送信されます。',
    icon: Users,
    time: '3分',
    details: [
      'スタッフのメールアドレスを入力',
      '役割（GM/スタッフ/管理者）を選択',
      '招待メールを送信',
    ],
  },
  {
    number: 5,
    title: 'スケジュールを作成',
    description: '公演スケジュールを作成。シナリオ、日時、GMを選択して登録します。',
    icon: Calendar,
    time: '5分',
    details: [
      '日付と時間を選択',
      'シナリオとGMを選択',
      '予約受付を開始',
    ],
  },
  {
    number: 6,
    title: '予約サイト公開！',
    description: '設定が完了したら予約サイトを公開。お客様からの予約を受け付け開始できます。',
    icon: Globe,
    time: '即時',
    details: [
      '予約サイトURLを取得',
      'SNSやWebサイトで告知',
      '予約が入ったら通知でお知らせ',
    ],
  },
]

const SUPPORT_ITEMS = [
  {
    icon: MessageCircle,
    title: 'チャットサポート',
    description: '困ったときはチャットでお問い合わせ。通常1営業日以内に回答します。',
  },
  {
    icon: BookOpen,
    title: 'ヘルプドキュメント',
    description: '操作方法やよくある質問を記載したマニュアルをご用意しています。',
  },
  {
    icon: Zap,
    title: '初期設定サポート',
    description: '初期設定でお困りの場合は、お気軽にお問い合わせください。',
  },
]

export function GettingStartedPage() {
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
            <span>導入の流れ</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center justify-center gap-3 mb-4">
            <Rocket className="w-10 h-10" />
            導入の流れ
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            登録から予約サイト公開まで、最短30分。<br />
            6つのステップで簡単に始められます。
          </p>
        </div>
      </section>

      {/* ステップ */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <div className="relative">
          {/* 縦線 */}
          <div 
            className="absolute left-8 top-0 bottom-0 w-0.5 hidden md:block"
            style={{ backgroundColor: THEME.primaryLight }}
          />
          
          <div className="space-y-12">
            {STEPS.map((step, idx) => (
              <div key={idx} className="relative flex gap-6 md:gap-8">
                {/* ステップ番号 */}
                <div className="flex-shrink-0">
                  <div 
                    className="w-16 h-16 flex items-center justify-center text-white font-bold text-xl relative z-10"
                    style={{ backgroundColor: THEME.primary }}
                  >
                    {step.number}
                  </div>
                </div>

                {/* コンテンツ */}
                <div className="flex-1 pb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-900">{step.title}</h3>
                    <span 
                      className="text-xs px-2 py-0.5 font-medium"
                      style={{ backgroundColor: THEME.primaryLight, color: THEME.primary }}
                    >
                      {step.time}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-4">{step.description}</p>
                  
                  {/* 詳細ステップ */}
                  <div className="bg-gray-50 border border-gray-200 p-4">
                    <ul className="space-y-2">
                      {step.details.map((detail, detailIdx) => (
                        <li key={detailIdx} className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: THEME.accent }} />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 所要時間まとめ */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            トータル所要時間
          </h2>
          <div 
            className="inline-flex items-center gap-4 px-8 py-4 text-white"
            style={{ backgroundColor: THEME.primary }}
          >
            <Zap className="w-8 h-8" />
            <div className="text-left">
              <div className="text-sm opacity-80">最短</div>
              <div className="text-3xl font-bold">約30分</div>
            </div>
          </div>
          <p className="text-gray-600 mt-6">
            ※ シナリオ数やスタッフ数によって所要時間は異なります
          </p>
        </div>
      </section>

      {/* サポート */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
          導入をサポートします
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {SUPPORT_ITEMS.map((item, idx) => (
            <div key={idx} className="bg-white border border-gray-200 p-6 text-center">
              <div 
                className="w-14 h-14 mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: THEME.primaryLight }}
              >
                <item.icon className="w-7 h-7" style={{ color: THEME.primary }} />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.description}</p>
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
              <Rocket className="w-12 h-12 mx-auto mb-4 opacity-90" />
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                今すぐ始めましょう
              </h2>
              <p className="opacity-90 mb-8 max-w-lg mx-auto">
                30分後には予約サイトが完成。<br />
                まずは無料プランでお試しください。
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-white hover:bg-gray-100 px-8"
                  style={{ color: THEME.primary, borderRadius: 0 }}
                  onClick={() => window.location.href = '/register'}
                >
                  無料で始める
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
                <Link to="/pricing">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/50 text-white hover:bg-white/10 px-8"
                    style={{ borderRadius: 0 }}
                  >
                    料金プランを見る
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

