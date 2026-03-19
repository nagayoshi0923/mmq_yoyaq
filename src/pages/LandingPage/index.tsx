/**
 * MMQ サービス訴求ランディングページ（顧客向け）
 * @path /lp
 */
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { Button } from '@/components/ui/button'
import {
  Search, Calendar, BookOpen, Heart, Users, Camera,
  ChevronRight, ArrowRight, Smartphone, Bell, Star,
  Sparkles, CheckCircle2, Ticket
} from 'lucide-react'

const PRIMARY = '#E60012'
const DARK = '#111111'

// プラットフォーム機能一覧
const FEATURES = [
  {
    icon: Search,
    title: 'シナリオ検索・フィルター',
    desc: 'ジャンル・所要時間・人数・店舗で絞り込み。180以上のシナリオからあなたにぴったりの作品をすぐ見つけられます。',
    color: '#3b82f6',
    bg: '#eff6ff',
  },
  {
    icon: Calendar,
    title: 'かんたんオンライン予約',
    desc: '空席をリアルタイムで確認しながら、スマホから24時間いつでも予約完了。面倒な電話や問い合わせは不要。',
    color: '#10b981',
    bg: '#ecfdf5',
  },
  {
    icon: Heart,
    title: '遊びたいリスト',
    desc: '気になるシナリオをハートでお気に入り登録。「次はこれを遊ぼう」リストをいつでも確認できます。',
    color: PRIMARY,
    bg: '#fff1f2',
  },
  {
    icon: Camera,
    title: '体験済みアルバム',
    desc: 'プレイしたシナリオが自動でアルバムに記録。おすすめ度（星評価）もつけてコレクションを育てられます。',
    color: '#f59e0b',
    bg: '#fffbeb',
  },
  {
    icon: Users,
    title: 'グループ貸切かんたん調整',
    desc: '招待コードをシェアするだけでグループ招集が完了。参加人数が集まったら自動で予約確定まで進みます。',
    color: '#8b5cf6',
    bg: '#f5f3ff',
  },
  {
    icon: Ticket,
    title: 'クーポン・特典管理',
    desc: '会員限定クーポンをマイページでまとめて管理。使用期限や割引内容をすぐ確認できます。',
    color: '#ec4899',
    bg: '#fdf2f8',
  },
]

// マイページでできること
const MYPAGE_FEATURES = [
  '予約確認・キャンセルがアプリで完結',
  '体験したシナリオが自動でアルバムに追加',
  '過去の体験を手動で追加・記録できる',
  'シナリオへのおすすめ度（★）評価を保存',
  '遊びたいシナリオをお気に入りリストで管理',
  '会員限定クーポンをいつでも確認',
  '参加人数の変更がマイページから可能',
]

export function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Header />

      {/* ═══ ヒーロー ═══ */}
      <section
        className="relative min-h-[85vh] flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 60%, #0d0000 100%)` }}
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 60px)`
          }}
        />
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${PRIMARY} 0%, transparent 70%)` }}
        />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-8 text-sm text-white/70">
            <Sparkles className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
            マーダーミステリー予約プラットフォーム
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white leading-tight tracking-tight mb-6">
            予約から記録まで、<br />
            <span style={{ color: PRIMARY }}>全部ここで</span>できる。
          </h1>

          <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            MMQはマーダーミステリーの予約・シナリオ検索・プレイ記録をひとつのアプリにまとめたサービス。
            会員登録（無料）すれば、スマホだけで全部完結します。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-base font-bold px-10 h-14 rounded-none shadow-2xl"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
              onClick={() => navigate('/signup')}
            >
              無料で会員登録する
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base font-bold px-10 h-14 rounded-none border-white/20 text-white bg-transparent hover:bg-white/10"
              onClick={() => navigate('/queens-waltz')}
            >
              公演を見てみる
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          <p className="mt-6 text-white/30 text-xs">登録無料・クレジットカード不要・30秒で完了</p>
        </div>
      </section>

      {/* ═══ こんな不満、ありませんでしたか？ ═══ */}
      <section className="py-16 px-4 bg-gray-50 border-b border-gray-100">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-bold tracking-widest mb-3 text-gray-400">PROBLEM</p>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-10">
            こんな不満、ありませんでしたか？
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              { emoji: '😩', text: '興味あるシナリオを探すのが大変…' },
              { emoji: '📞', text: '予約のために電話しないといけない' },
              { emoji: '🙈', text: 'どのシナリオを遊んだか忘れてしまう' },
            ].map(({ emoji, text }) => (
              <div key={text} className="bg-white border border-gray-200 p-5 flex items-start gap-3">
                <span className="text-2xl mt-0.5">{emoji}</span>
                <p className="text-gray-700 font-medium text-sm">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-gray-400 text-sm font-bold">MMQが全部解決します</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
        </div>
      </section>

      {/* ═══ 6つの機能 ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>FEATURES</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">
              MMQでできること
            </h2>
            <p className="text-gray-500 mt-3 text-sm">会員登録（無料）するだけで全機能が使えます</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
              <div
                key={title}
                className="p-6 border border-gray-100 hover:shadow-md transition-shadow group"
              >
                <div
                  className="w-11 h-11 flex items-center justify-center mb-4 rounded-lg"
                  style={{ backgroundColor: bg }}
                >
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ マイページ詳細 ═══ */}
      <section className="py-20 px-4" style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 100%)` }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>MY PAGE</p>
              <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-6">
                マイページひとつで<br />全部管理できる
              </h2>
              <p className="text-white/60 text-sm leading-relaxed mb-8">
                会員登録すると、予約・シナリオ記録・お気に入りをまとめて管理できるマイページが使えます。
                スマホだけでOK、アプリのインストールも不要。
              </p>
              <ul className="space-y-3">
                {MYPAGE_FEATURES.map(text => (
                  <li key={text} className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: PRIMARY }} />
                    <span className="text-white/80 text-sm">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 右側モックUI */}
            <div className="relative">
              <div
                className="rounded-none border border-white/10 overflow-hidden max-w-xs mx-auto"
                style={{ backgroundColor: '#1a1a1a' }}
              >
                {/* ヘッダー */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIMARY }} />
                  <span className="text-white/60 text-xs">マイページ</span>
                </div>
                {/* アルバム */}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Camera className="w-4 h-4" style={{ color: PRIMARY }} />
                    <span className="text-white text-xs font-bold">体験済みアルバム</span>
                    <span className="ml-auto text-white/40 text-xs">23作品</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-4">
                    {['🔍', '🗡️', '👁️', '🌙', '🎭', '🔮'].map((e, i) => (
                      <div
                        key={i}
                        className="aspect-square flex items-center justify-center text-xl rounded-sm"
                        style={{ backgroundColor: '#2a2a2a' }}
                      >
                        {e}
                        <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
                          {[1,2,3].map(s => (
                            <Star key={s} className="w-1.5 h-1.5 fill-yellow-400 text-yellow-400" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* お気に入り */}
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4" style={{ color: PRIMARY }} />
                    <span className="text-white text-xs font-bold">遊びたいリスト</span>
                    <span className="ml-auto text-white/40 text-xs">8件</span>
                  </div>
                  <div className="space-y-1.5">
                    {['ダークサイドの君へ', '消えた探偵', 'The Real Fork'].map(title => (
                      <div
                        key={title}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-sm"
                        style={{ backgroundColor: '#2a2a2a' }}
                      >
                        <BookOpen className="w-3 h-3 text-white/40" />
                        <span className="text-white/70 text-xs truncate">{title}</span>
                        <Heart className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: PRIMARY }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ シナリオ検索 ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* 左側モックUI */}
            <div
              className="border border-gray-200 p-5 max-w-xs mx-auto w-full"
            >
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-2 mb-4">
                <Search className="w-4 h-4 text-gray-400" />
                <span className="text-gray-400 text-sm">シナリオを検索...</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['ホラー', 'SF', '日常系', 'ファンタジー', 'デスゲーム'].map(g => (
                  <span
                    key={g}
                    className="text-xs px-2 py-0.5 border rounded-full"
                    style={g === 'ホラー' ? { backgroundColor: PRIMARY, color: '#fff', borderColor: PRIMARY } : { borderColor: '#e5e7eb', color: '#6b7280' }}
                  >
                    {g}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-4">
                <div className="border border-gray-200 px-2 py-1.5 flex items-center gap-1">
                  <span>⏱</span> 4時間
                </div>
                <div className="border border-gray-200 px-2 py-1.5 flex items-center gap-1">
                  <span>👥</span> 6人
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { title: '深夜の研究室', genre: 'ホラー', time: '4h' },
                  { title: '消えた探偵', genre: 'SF', time: '5h' },
                  { title: '幽霊船の謎', genre: 'ホラー', time: '4h' },
                ].map(({ title, genre, time }) => (
                  <div key={title} className="flex items-center gap-2 p-2 border border-gray-100 hover:bg-gray-50">
                    <div className="w-8 h-8 bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">🎭</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{title}</p>
                      <p className="text-xs text-gray-400">{genre} · {time}</p>
                    </div>
                    <Heart className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>SEARCH</p>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-6">
                180以上のシナリオを<br />かんたん検索
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                ジャンル・所要時間・参加人数・開催店舗などで絞り込めるので、
                「今日の夕方、6人でホラーをやりたい」という条件にも即対応できます。
              </p>
              <ul className="space-y-3">
                {[
                  'ジャンル・所要時間・人数・店舗で絞り込み',
                  '実際に存在する時間の選択肢のみ表示（無駄な候補なし）',
                  '気になったらその場でハート登録',
                  '体験済みのシナリオはアルバムで確認',
                ].map(text => (
                  <li key={text} className="flex items-start gap-3 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: PRIMARY }} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 貸切グループ ═══ */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>GROUP</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-6">
            グループ参加もかんたん
          </h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto mb-12 leading-relaxed">
            幹事が招待コードを作ってシェアするだけ。メンバーがコードを入力すれば自動でグループに参加できます。人数が揃ったら貸切予約もスムーズ。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { step: '1', icon: '📋', title: '幹事がグループ作成', desc: 'シナリオと希望日を設定して招待コードを発行' },
              { step: '2', icon: '🔗', title: 'コードをシェア', desc: 'LINEやSNSで招待コードをシェアするだけ' },
              { step: '3', icon: '✅', title: '人数が揃ったら予約確定', desc: '全員参加後に自動で貸切予約へ進める' },
            ].map(({ step, icon, title, desc }) => (
              <div key={step} className="bg-white border border-gray-200 p-6 text-left relative">
                <div
                  className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-xs font-black text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {step}
                </div>
                <div className="text-3xl mb-3">{icon}</div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ スマホで完結バナー ═══ */}
      <section
        className="py-16 px-4"
        style={{ backgroundColor: PRIMARY }}
      >
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto md:mx-0">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white mb-1">アプリ不要・スマホだけでOK</h3>
            <p className="text-white/80 text-sm">
              インストール不要のWebアプリ。ブラウザを開くだけで予約・記録・検索が全部できます。
            </p>
          </div>
          <Button
            variant="outline"
            className="border-white text-white bg-transparent hover:bg-white/20 font-bold px-6 rounded-none flex-shrink-0"
            onClick={() => navigate('/signup')}
          >
            今すぐ試す <ArrowRight className="ml-1 w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* ═══ 通知 ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>NOTIFICATION</p>
          <h2 className="text-3xl font-black text-gray-900 mb-6">
            大事なお知らせを見逃さない
          </h2>
          <p className="text-gray-500 text-sm max-w-xl mx-auto mb-10">
            予約確定・公演キャンセル・開催確定の通知がメールで届きます。当日慌てる心配なし。
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {[
              { icon: '📩', label: '予約確定メール' },
              { icon: '✅', label: '開催確定通知' },
              { icon: '❌', label: '公演中止のお知らせ' },
              { icon: '🎟️', label: 'クーポン配信' },
            ].map(({ icon, label }) => (
              <div key={label} className="border border-gray-200 p-4 text-center">
                <div className="text-2xl mb-2">{icon}</div>
                <p className="text-xs text-gray-600 font-medium">{label}</p>
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
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/10 rounded-full px-4 py-1.5 mb-8 text-xs text-white/50">
            <Bell className="w-3.5 h-3.5" />
            登録無料・いつでも退会できます
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            まずは、<span style={{ color: PRIMARY }}>無料</span>で<br />使ってみてください。
          </h2>
          <p className="text-white/50 mb-10 text-sm leading-relaxed">
            会員登録はメールアドレスだけで30秒。クレジットカードの登録も不要です。
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
              まず公演を見る
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mt-10 text-white/30 text-xs">
            {[
              { label: 'よくある質問', path: '/faq' },
              { label: '利用ガイド', path: '/guide' },
              { label: 'キャンセルポリシー', path: '/cancel-policy' },
              { label: 'お問い合わせ', path: '/contact' },
            ].map(({ label, path }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className="hover:text-white/60 transition-colors underline underline-offset-2"
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
