/**
 * MMQ サービス訴求ランディングページ（顧客向け）
 * @path /lp
 */
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Button } from '@/components/ui/button'
import {
  Users, Clock, MapPin, Star, ChevronRight, Play,
  Sparkles, Shield, Smartphone, BookOpen, CheckCircle2,
  ArrowRight, Heart, Award
} from 'lucide-react'

const PRIMARY = '#E60012'
const DARK = '#111111'

// ---- データ ----
const FEATURES = [
  {
    icon: BookOpen,
    title: '180以上のシナリオ',
    desc: 'ホラー・SF・ファンタジー・日常系など多彩なジャンル。初心者から上級者まで楽しめる作品が揃っています。',
  },
  {
    icon: MapPin,
    title: '複数店舗で開催',
    desc: '馬場・大塚・埼玉大宮など都内・近郊の複数店舗で定期開催。あなたの近くで参加できます。',
  },
  {
    icon: Users,
    title: '少人数〜貸切まで',
    desc: '一人でも参加できる少人数公演から、グループ貸切プランまで柔軟に対応。',
  },
  {
    icon: Smartphone,
    title: 'かんたんオンライン予約',
    desc: '会員登録すればスマホから24時間いつでも予約。当日の流れもアプリで確認できます。',
  },
  {
    icon: Shield,
    title: '安心のキャンセルポリシー',
    desc: '公演4時間前まではキャンセル料無料。急な予定変更にも対応しています。',
  },
  {
    icon: Award,
    title: 'プロGMが全力サポート',
    desc: 'マーダーミステリー経験豊富なGMが進行をサポート。はじめての方も安心して楽しめます。',
  },
]

const STEPS = [
  { num: '01', title: '会員登録（無料）', desc: 'メールアドレスで30秒で完了。SNSアカウントでも登録可能。' },
  { num: '02', title: 'シナリオを選ぶ', desc: '180以上のシナリオからジャンル・日程・人数で検索。' },
  { num: '03', title: '予約を確定', desc: '日程・店舗を選んでオンラインで予約完了。' },
  { num: '04', title: '当日参加・体験！', desc: '店舗へ向かい、謎解きと推理を楽しむだけ。' },
]

const VOICES = [
  {
    name: 'Aさん（20代女性）',
    genre: 'ホラー好き',
    text: '友達と参加したら大盛り上がり！シナリオの完成度が高くて本格的な推理ゲームができました。また来ます！',
    stars: 5,
  },
  {
    name: 'Bさん（30代男性）',
    genre: 'はじめての参加',
    text: 'マーダーミステリー初体験でしたがGMさんが丁寧に教えてくれて安心でした。没入感が半端ない。',
    stars: 5,
  },
  {
    name: 'Cさん（20代男性）',
    genre: 'リピーター',
    text: 'もう10回以上参加しています。シナリオの種類が豊富で毎回新鮮な体験ができるのが最高。',
    stars: 5,
  },
]

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Header />

      {/* ═══ ヒーロー ═══ */}
      <section
        className="relative min-h-[90vh] flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 50%, #2a0000 100%)` }}
      >
        {/* 背景装飾 */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(230,0,18,0.3) 40px, rgba(230,0,18,0.3) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(230,0,18,0.3) 40px, rgba(230,0,18,0.3) 41px)`
          }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] opacity-20 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${PRIMARY} 0%, transparent 70%)` }}
        />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          {/* バッジ */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-8 text-sm text-white/80">
            <Sparkles className="w-4 h-4" style={{ color: PRIMARY }} />
            マーダーミステリー専門プラットフォーム
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white leading-none tracking-tight mb-6">
            あなたが、
            <br />
            <span style={{ color: PRIMARY }}>探偵</span>になる夜。
          </h1>

          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
            MMQは、本格マーダーミステリーを手軽に楽しめる予約プラットフォーム。
            <br className="hidden md:block" />
            180以上のシナリオ、複数の会場で、非日常の体験があなたを待っています。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="w-full sm:w-auto text-base font-bold px-8 h-14 rounded-none shadow-2xl"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
              onClick={() => navigate('/signup')}
            >
              無料で会員登録する
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto text-base font-bold px-8 h-14 rounded-none border-white/30 text-white bg-transparent hover:bg-white/10"
              onClick={() => navigate('/queens-waltz')}
            >
              <Play className="mr-2 w-4 h-4" />
              公演を見てみる
            </Button>
          </div>

          {/* 実績数字 */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {[
              { num: '180+', label: 'シナリオ数' },
              { num: '5', label: '開催店舗' },
              { num: '4h', label: '没入体験' },
            ].map(({ num, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl md:text-4xl font-black" style={{ color: PRIMARY }}>{num}</div>
                <div className="text-xs text-white/50 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 下部の矢印 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronRight className="w-6 h-6 text-white/30 rotate-90" />
        </div>
      </section>

      {/* ═══ マーダーミステリーとは？ ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>WHAT IS MMQ</p>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-6">
                マーダーミステリーって<br />なに？
              </h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                マーダーミステリーは、参加者それぞれが与えられたキャラクターを演じながら、殺人事件の謎を解く没入型の推理ゲームです。
              </p>
              <p className="text-gray-600 leading-relaxed mb-8">
                小説や映画を「読む・観る」のではなく、<strong className="text-gray-900">自ら物語の中に入り込んで体験する</strong>のが最大の魅力。犯人かもしれない、探偵かもしれない——あなたの役割次第でストーリーが変わります。
              </p>
              <ul className="space-y-3">
                {['ネタバレ厳禁のため、何度でも新鮮に楽しめる', '友達・カップル・家族みんなで盛り上がれる', '演技が苦手でも大丈夫！キャラを楽しむだけでOK'].map(text => (
                  <li key={text} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: PRIMARY }} />
                    <span className="text-gray-700 text-sm">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 右側ビジュアル */}
            <div className="relative">
              <div
                className="aspect-square max-w-md mx-auto flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${DARK} 0%, #3a0000 100%)` }}
              >
                <div className="text-center p-8">
                  <div className="text-8xl mb-4">🔍</div>
                  <div className="text-white text-xl font-bold mb-2">あなたは誰？</div>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {['探偵', '犯人', '目撃者', '被疑者', '共犯者'].map(role => (
                      <span
                        key={role}
                        className="px-3 py-1 text-xs font-bold text-white border rounded-full"
                        style={{ borderColor: `${PRIMARY}60` }}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* 装飾 */}
              <div
                className="absolute -bottom-4 -right-4 w-24 h-24"
                style={{ backgroundColor: PRIMARY, opacity: 0.15 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 特徴 ═══ */}
      <section className="py-20 px-4" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>WHY MMQ</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">MMQが選ばれる理由</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white p-6 border border-gray-100 hover:border-gray-300 hover:shadow-lg transition-all group"
              >
                <div
                  className="w-12 h-12 flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#FEE2E2' }}
                >
                  <Icon className="w-6 h-6" style={{ color: PRIMARY }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 参加の流れ ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>HOW TO</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">参加の流れ</h2>
          </div>

          <div className="space-y-0">
            {STEPS.map(({ num, title, desc }, i) => (
              <div key={num} className="flex gap-6 items-start">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className="w-14 h-14 flex items-center justify-center font-black text-white text-lg"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {num}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-0.5 h-12 mt-0" style={{ backgroundColor: '#FEE2E2' }} />
                  )}
                </div>
                <div className="pb-10">
                  <h3 className="text-xl font-bold text-gray-900 mb-1 mt-3">{title}</h3>
                  <p className="text-gray-600 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 口コミ ═══ */}
      <section className="py-20 px-4" style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 100%)` }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>VOICES</p>
            <h2 className="text-3xl md:text-4xl font-black text-white">参加者の声</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {VOICES.map(({ name, genre, text, stars }) => (
              <div
                key={name}
                className="p-6 border border-white/10"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-white/80 text-sm leading-relaxed mb-4">「{text}」</p>
                <div>
                  <div className="text-white font-bold text-sm">{name}</div>
                  <div className="text-white/40 text-xs">{genre}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 料金 ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>PRICE</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">料金について</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 通常参加 */}
            <div className="border-2 border-gray-200 p-8">
              <div className="text-sm font-bold text-gray-500 mb-2">通常参加</div>
              <div className="text-4xl font-black text-gray-900 mb-1">
                ¥3,500<span className="text-lg font-normal text-gray-500">〜</span>
              </div>
              <div className="text-sm text-gray-500 mb-6">/お一人様（税込）</div>
              <ul className="space-y-2">
                {['シナリオ代込み', '入場料込み', '初心者歓迎', 'GMサポート付き'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: PRIMARY }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* 貸切 */}
            <div className="border-2 p-8" style={{ borderColor: PRIMARY, backgroundColor: '#fff5f5' }}>
              <div className="inline-block text-xs font-bold text-white px-2 py-0.5 mb-2" style={{ backgroundColor: PRIMARY }}>
                人気
              </div>
              <div className="text-sm font-bold text-gray-500 mb-2">グループ貸切</div>
              <div className="text-4xl font-black text-gray-900 mb-1">
                ¥8,000<span className="text-lg font-normal text-gray-500">〜</span>
              </div>
              <div className="text-sm text-gray-500 mb-6">/グループ（税込）</div>
              <ul className="space-y-2">
                {['グループ専用で開催', '日程・人数の相談可', 'サプライズ企画OK', 'SNS映えの演出対応'].map(t => (
                  <li key={t} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: PRIMARY }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            ※ 料金はシナリオ・人数・プランにより異なります。詳細は各公演ページをご確認ください。
          </p>
        </div>
      </section>

      {/* ═══ こんな人におすすめ ═══ */}
      <section className="py-20 px-4" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>FOR YOU</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">こんな方におすすめ</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { emoji: '👥', text: '友達と非日常を楽しみたい' },
              { emoji: '💑', text: 'カップルで新鮮な体験をしたい' },
              { emoji: '🎉', text: '誕生日・記念日のサプライズに' },
              { emoji: '🏢', text: '職場のチームビルディングに' },
              { emoji: '🔍', text: '推理・謎解きが好き' },
              { emoji: '🎭', text: 'ロールプレイ・演技が好き' },
            ].map(({ emoji, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 bg-white p-4 border border-gray-100"
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-sm font-medium text-gray-800">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 最終CTA ═══ */}
      <section
        className="py-24 px-4 text-center"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #2a0000 100%)` }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6">
            <Heart className="w-5 h-5" style={{ color: PRIMARY }} />
            <span className="text-white/60 text-sm">会員登録は無料・30秒で完了</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            さあ、<span style={{ color: PRIMARY }}>謎解き</span>を<br />はじめよう。
          </h2>
          <p className="text-white/60 mb-10">
            まずは公演ラインナップをチェック。気になるシナリオを見つけたら、すぐに予約できます。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="font-bold px-10 h-14 rounded-none shadow-2xl text-base"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
              onClick={() => navigate('/signup')}
            >
              無料で会員登録
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-bold px-10 h-14 rounded-none border-white/20 text-white bg-transparent hover:bg-white/10 text-base"
              onClick={() => navigate('/queens-waltz')}
            >
              公演を見る
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          {/* 補足リンク */}
          <div className="flex flex-wrap justify-center gap-4 mt-10 text-white/40 text-xs">
            {[
              { label: 'よくある質問', path: '/faq' },
              { label: '利用ガイド', path: '/guide' },
              { label: 'キャンセルポリシー', path: '/cancel-policy' },
              { label: 'お問い合わせ', path: '/contact' },
            ].map(({ label, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="hover:text-white/70 transition-colors underline underline-offset-2"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default LandingPage
