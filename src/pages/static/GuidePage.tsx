/**
 * 初めての方へ / 遊び方ガイドページ
 * @path /guide
 */
import { PublicLayout } from '@/components/layout/PublicLayout'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { 
  BookOpen, ChevronRight, Users, Clock, MessageCircle, 
  Search, Shield, Sparkles, CheckCircle, ArrowRight,
  Target, Brain, Drama, UserCheck
} from 'lucide-react'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    number: 1,
    title: 'シナリオを選ぶ',
    description: 'お好みのテーマや人数に合わせてシナリオを検索。初心者向けマークがついたシナリオがおすすめです。',
    icon: Search,
  },
  {
    number: 2,
    title: '日時・店舗を選んで予約',
    description: 'カレンダーから都合の良い日時を選択。友達と参加する場合は人数分まとめて予約できます。',
    icon: Clock,
  },
  {
    number: 3,
    title: '当日、店舗へ',
    description: '予約時の注意事項を確認し、指定の時間に到着。スタッフがルールを丁寧に説明しますので、初めてでも安心です。',
    icon: UserCheck,
  },
  {
    number: 4,
    title: '事件発生！推理開始',
    description: 'キャラクターになりきって議論。証拠を集め、嘘を見抜き、真犯人を見つけ出しましょう！',
    icon: Target,
  },
]

const FEATURES = [
  {
    icon: Drama,
    title: 'ロールプレイを楽しむ',
    description: '配られた役になりきって演じます。普段の自分とは違う人格を体験できる非日常感が魅力です。',
  },
  {
    icon: Brain,
    title: '推理する',
    description: '証拠を集め、矛盾を見つけ、真実を追求。論理的思考力を活かして謎を解き明かしましょう。',
  },
  {
    icon: MessageCircle,
    title: '議論する',
    description: '他の参加者と情報を交換し、議論を重ねます。コミュニケーション能力が試される場面も。',
  },
  {
    icon: Shield,
    title: '秘密を守る',
    description: '自分だけが知る秘密を持っています。どこまで明かし、何を隠すかはあなた次第。',
  },
]

export function GuidePage() {
  return (
    <PublicLayout>
      {/* ヒーロー */}
      <section 
        className="relative overflow-hidden py-16 md:py-24"
        style={{ backgroundColor: THEME.primary }}
      >
        <div 
          className="absolute top-0 right-0 w-96 h-96 opacity-20"
          style={{ 
            background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-2 h-32"
          style={{ backgroundColor: THEME.accent }}
        />
        <div className="max-w-4xl mx-auto px-4 relative text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 text-sm mb-4">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>初めての方へ</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 flex items-center justify-center gap-3">
            <BookOpen className="w-10 h-10" />
            初めての方へ
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            マーダーミステリーは、参加者全員が物語の登場人物となり、<br className="hidden md:block" />
            起こった事件の真相を解き明かす体験型ゲームです。
          </p>
        </div>
      </section>

      {/* マーダーミステリーとは */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          マーダーミステリーとは？
        </h2>
        <div className="bg-gray-50 p-8 border border-gray-200 mb-8">
          <p className="text-lg text-gray-700 leading-relaxed text-center">
            マーダーミステリーは、<strong>「あなた自身が物語の登場人物になる」</strong>体験型推理ゲームです。<br /><br />
            参加者はそれぞれキャラクターを担当し、設定された物語の中で発生した事件の謎を解き明かします。<br />
            キャラクターには「あなただけが知っている秘密」が設定されており、<br />
            何を話し、何を隠すかはあなた次第。<br /><br />
            <span className="text-red-600 font-semibold">真実を暴くのか、それとも隠し通すのか——</span><br />
            予測不能な展開と、一度きりの物語をお楽しみください。
          </p>
        </div>

        {/* 特徴 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {FEATURES.map((feature, index) => (
            <div key={index} className="bg-white p-6 border border-gray-200 hover:shadow-lg transition-shadow">
              <div 
                className="w-12 h-12 flex items-center justify-center mb-4"
                style={{ backgroundColor: THEME.primaryLight }}
              >
                <feature.icon className="w-6 h-6" style={{ color: THEME.primary }} />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 参加の流れ */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-12 text-center flex items-center justify-center gap-3">
            <Sparkles className="w-6 h-6" style={{ color: THEME.primary }} />
            参加の流れ
          </h2>
          <div className="space-y-8">
            {STEPS.map((step, index) => (
              <div key={index} className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div 
                    className="w-14 h-14 flex items-center justify-center text-white font-bold text-xl"
                    style={{ backgroundColor: THEME.primary }}
                  >
                    {step.number}
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="w-0.5 h-8 mx-auto mt-2" style={{ backgroundColor: THEME.primary + '40' }} />
                  )}
                </div>
                <div className="flex-1 bg-white p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-2">
                    <step.icon className="w-5 h-5" style={{ color: THEME.primary }} />
                    <h3 className="font-bold text-lg text-gray-900">{step.title}</h3>
                  </div>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 当日の持ち物・注意事項 */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          当日のご案内
        </h2>
        
        {/* 予約時の注意事項を確認 */}
        <div className="mb-8 bg-blue-50 border border-blue-200 p-6">
          <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            予約時の注意事項を必ずご確認ください
          </h3>
          <p className="text-blue-800 text-sm mb-3">
            開始時刻・到着時間・持ち物・アクセス方法などは<strong>店舗・シナリオによって異なります</strong>。
          </p>
          <p className="text-blue-800 text-sm">
            予約完了時に送信されるメール、または予約詳細ページに記載されている<strong>「注意事項」を必ずご確認</strong>の上、当日お越しください。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 border border-gray-200">
            <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" style={{ color: THEME.accent }} />
              持ち物（一般的な例）
            </h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>基本的には手ぶらでOKなことが多いですが、店舗によって異なります。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>事前読み物があるシナリオは、可能であれば事前にお読みください。</span>
              </li>
            </ul>
          </div>
          <div className="bg-white p-6 border border-gray-200">
            <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: THEME.primary }} />
              到着時刻（一般的な例）
            </h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">●</span>
                <span>開始時刻の<strong>10〜15分前</strong>到着が目安ですが、店舗の指示に従ってください。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">●</span>
                <span>遅刻されると公演に参加できない場合があります。</span>
              </li>
            </ul>
          </div>
        </div>

        {/* 重要事項 */}
        <div className="mt-8 bg-amber-50 border border-amber-200 p-6">
          <h3 className="font-bold text-amber-900 mb-3">⚠️ ご注意</h3>
          <ul className="space-y-2 text-amber-800 text-sm">
            <li>• マーダーミステリーは<strong>1度しか体験できません</strong>。同じシナリオの再参加はご遠慮ください。</li>
            <li>• 公演中の<strong>撮影・録音・ネタバレは禁止</strong>です。</li>
            <li>• 途中退出はできません。公演時間を確認の上、最後まで参加できる日程でご予約ください。</li>
          </ul>
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
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                さあ、物語の世界へ
              </h2>
              <p className="opacity-90 mb-8 max-w-lg mx-auto">
                あなたを待つ謎と物語。<br />
                今すぐシナリオを探して、初めてのマーダーミステリーを体験しましょう。
              </p>
              <Link to="/">
                <Button
                  size="lg"
                  className="bg-white hover:bg-gray-100 px-8 hover:scale-[1.02] transition-transform"
                  style={{ color: THEME.primary, borderRadius: 0 }}
                >
                  シナリオを探す
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}

