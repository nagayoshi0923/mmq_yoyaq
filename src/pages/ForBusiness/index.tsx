/**
 * 店舗オーナー向け訴求ランディングページ
 * @path /for-business
 */
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import {
  Calendar, BarChart3, Users, Globe, ChevronRight, ArrowRight,
  CheckCircle2, Zap, Clock, FileText, Bell, Shield, Building2,
  BookOpen, Star
} from 'lucide-react'

const PRIMARY = '#E60012'
const DARK = '#111111'

const FEATURES = [
  {
    icon: Calendar,
    title: 'スケジュール管理',
    desc: '公演スケジュールをカレンダーで一元管理。シフト提出・GM割り当てまで完結します。',
    color: '#3b82f6',
    bg: '#eff6ff',
  },
  {
    icon: Users,
    title: 'スタッフ・GM管理',
    desc: 'スタッフの役割・空き状況を管理。招待リンクを送るだけで追加できます。',
    color: '#8b5cf6',
    bg: '#f5f3ff',
  },
  {
    icon: BarChart3,
    title: '売上・分析レポート',
    desc: '日次・月次の売上を自動集計。ライセンス報告書もワンクリックで出力。',
    color: '#10b981',
    bg: '#ecfdf5',
  },
  {
    icon: BookOpen,
    title: 'シナリオ管理',
    desc: '公演シナリオを一覧管理。GMごとの担当シナリオも設定できます。',
    color: '#f59e0b',
    bg: '#fffbeb',
  },
  {
    icon: FileText,
    title: 'マニュアル・情報共有',
    desc: 'スタッフ向けのマニュアルをアプリ内で作成・共有。いつでもどこでも確認できます。',
    color: '#ec4899',
    bg: '#fdf2f8',
  },
  {
    icon: Bell,
    title: 'Discord 通知連携',
    desc: '予約・キャンセル・シフトの変更を Discord に自動通知。見落としを防ぎます。',
    color: '#6366f1',
    bg: '#eef2ff',
  },
]

const BOOKING_FEATURES = [
  '24時間オンライン予約受付',
  '予約確定・リマインドメールの自動送信',
  '空席リアルタイム表示',
  '予約サイトのデザインカスタマイズ',
  'キャンセル・変更の自動受付',
  '貸切グループ予約対応',
]

const STEPS = [
  {
    number: '01',
    title: '組織を登録する',
    desc: 'メールアドレスとパスワードを設定するだけ。30秒で完了。',
    time: '30秒',
  },
  {
    number: '02',
    title: '店舗・シナリオを設定する',
    desc: '店舗情報とシナリオを入力。スタッフを招待して準備完了。',
    time: '約10分',
  },
  {
    number: '03',
    title: 'すぐに使い始める',
    desc: 'スケジュール管理・売上管理・スタッフ管理をすぐに開始できます。',
    time: '即日',
  },
]

export function ForBusinessPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Header />

      {/* ═══ ヒーロー ═══ */}
      <section
        className="relative min-h-[80vh] flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 60%, #0d0000 100%)` }}
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: `repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 60px)` }}
        />
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] opacity-15 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${PRIMARY} 0%, transparent 70%)` }}
        />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-8 text-sm text-white/70">
            <Building2 className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
            マーダーミステリー店舗向け管理プラットフォーム
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white leading-tight tracking-tight mb-6">
            店舗運営の手間を、<br />
            <span style={{ color: PRIMARY }}>まるごと解消。</span>
          </h1>

          <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            MMQは、マーダーミステリー店舗のスケジュール・スタッフ・売上管理をひとつにまとめた
            プラットフォームです。<br />
            <span className="text-white/80 font-semibold">管理機能はずっと無料</span>でご利用いただけます。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-base font-bold px-10 h-14 rounded-none shadow-2xl"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
              onClick={() => navigate('/start')}
            >
              無料で始める
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base font-bold px-10 h-14 rounded-none border-white/20 text-white bg-transparent hover:bg-white/10"
              onClick={() => navigate('/pricing')}
            >
              料金プランを見る
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>

          <p className="mt-6 text-white/30 text-xs">登録無料・クレジットカード不要</p>
        </div>
      </section>

      {/* ═══ こんな悩みありませんか ═══ */}
      <section className="py-16 px-4 bg-gray-50 border-b border-gray-100">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-bold tracking-widest mb-3 text-gray-400">PROBLEM</p>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-10">
            こんな悩み、ありませんか？
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              { emoji: '📋', text: 'スケジュール管理がスプレッドシートでバラバラ' },
              { emoji: '📞', text: 'スタッフとの情報共有にLINEを使っていて漏れが怖い' },
              { emoji: '💸', text: '売上の集計や報告書作成に毎月時間がかかる' },
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

      {/* ═══ 管理機能（無料） ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-1.5 mb-4 text-sm font-bold text-green-700">
              ずっと無料
            </div>
            <p className="text-sm font-bold tracking-widest mb-3 text-gray-400">MANAGEMENT FEATURES</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900">
              管理機能
            </h2>
            <p className="text-gray-500 mt-3 text-sm">店舗数・スタッフ数の制限なし。すべて無料でお使いいただけます。</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
              <div
                key={title}
                className="p-6 border border-gray-100 hover:shadow-md transition-shadow"
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

      {/* ═══ 予約サイト公開（有料オプション） ═══ */}
      <section
        className="py-20 px-4"
        style={{ background: `linear-gradient(135deg, ${DARK} 0%, #1a0000 100%)` }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm text-white/70">
                <Zap className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                オプション / ¥4,980/月
              </div>
              <p className="text-sm font-bold tracking-widest mb-3" style={{ color: PRIMARY }}>BOOKING SITE</p>
              <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-6">
                予約サイトも<br />公開できます
              </h2>
              <p className="text-white/60 text-sm leading-relaxed mb-8">
                管理機能に加えて、お客様向けの予約サイトを公開できます。
                24時間自動受付・自動メール送信で、予約対応の手間をゼロに。
              </p>
              <ul className="space-y-3 mb-8">
                {BOOKING_FEATURES.map(text => (
                  <li key={text} className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: PRIMARY }} />
                    <span className="text-white/80 text-sm">{text}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="border-white/30 text-white bg-transparent hover:bg-white/10 rounded-none"
                onClick={() => navigate('/pricing')}
              >
                料金プランの詳細
                <ChevronRight className="ml-1 w-4 h-4" />
              </Button>
            </div>

            <div className="relative hidden md:block">
              <div
                className="rounded-none border border-white/10 overflow-hidden"
                style={{ backgroundColor: '#1a1a1a' }}
              >
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIMARY }} />
                  <span className="text-white/60 text-xs">予約サイト（サンプル）</span>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { title: '消えた探偵', time: '120分', players: '4〜6人', status: '残2枠' },
                    { title: '深夜の研究室', time: '90分', players: '3〜5人', status: '満員' },
                    { title: '幽霊船の謎', time: '150分', players: '5〜8人', status: '残4枠' },
                  ].map(({ title, time, players, status }) => (
                    <div key={title} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10">
                      <div className="w-9 h-9 bg-white/10 flex items-center justify-center text-lg flex-shrink-0">🎭</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{title}</p>
                        <p className="text-white/40 text-xs">{time} · {players}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        status === '満員'
                          ? 'bg-red-900/50 text-red-300'
                          : 'bg-green-900/50 text-green-300'
                      }`}>{status}</span>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    className="w-full rounded-none text-xs font-bold mt-2"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    予約する
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 始め方 ═══ */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-bold tracking-widest mb-3 text-gray-400">HOW TO START</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-14">
            3ステップで始められます
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map(({ number, title, desc, time }) => (
              <div key={number} className="text-left">
                <div
                  className="text-5xl font-black mb-4 leading-none"
                  style={{ color: `${PRIMARY}20` }}
                >
                  {number}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-bold text-gray-900">{title}</h3>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3 inline mr-1" />{time}
                  </span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 安心・サポート ═══ */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            {[
              { icon: Shield, title: 'セキュリティ', desc: 'Supabase による認証・データ暗号化。安心してご利用いただけます。' },
              { icon: Star, title: 'クイーンズワルツ採用実績', desc: '国内最大級のマーダーミステリー専門店が実際に使用しています。' },
              { icon: Globe, title: 'いつでも解約可能', desc: '契約期間の縛りはありません。いつでも無料プランに戻せます。' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-gray-600" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-sm">{title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
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
          <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
            まずは<span style={{ color: PRIMARY }}>無料</span>で<br />試してみてください。
          </h2>
          <p className="text-white/50 mb-10 text-sm leading-relaxed">
            管理機能はずっと無料。店舗数・スタッフ数の制限もありません。
          </p>
          <Button
            size="lg"
            className="font-bold px-12 h-14 rounded-none shadow-2xl text-base"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
            onClick={() => navigate('/start')}
          >
            無料で組織を登録する
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <p className="mt-6 text-white/30 text-xs">
            登録無料・クレジットカード不要・
            <Link to="/pricing" className="underline hover:text-white/50">料金プランを見る</Link>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default ForBusinessPage
