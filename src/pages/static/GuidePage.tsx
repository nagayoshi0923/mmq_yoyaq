/**
 * 初めての方へ / 使い方ガイドページ
 * @path /guide（組織付き /{org}/guide も同じ）
 * 貸切の流れは別ページ（PrivateGuidePage.tsx、/guide/private）。
 *
 * 2026-10-11 点検 22 で今の画面に合わせて書き直し。
 * 画面例: ログイン不要の画面は 375px の実画面の画像（public/guide-images/）、
 * マイページ・グループページは実際の部品に見本の値を入れたもの（guide/GuideDemos.tsx）。
 * 画面を変えたら、画像を撮り直してこのページの文も合わせる。
 */
import { useEffect } from 'react'
import { ArrowRight, CalendarCheck, ChevronRight, HelpCircle, Users } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { JsonLd } from '@/components/seo/JsonLd'
import { usePageMeta } from '@/hooks/usePageMeta'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { STATIC_PUBLIC_META, buildFaqJsonLd, MURDER_MYSTERY_FAQ } from '@/lib/seo'
import { Annotation, GuideShot } from './guide/GuideDemos'
import { Body, GuideEntryLinks, Section, StepHeading } from './guide/GuideParts'
import { privateGuidePath } from './guide/privateGuidePath'

const IMG = '/guide-images'
/** 手順 1 の節の id（上の入口「公演を予約する流れ」のスクロール先） */
const BOOKING_STEPS_ID = 'booking-steps'

export function GuidePage({ organizationSlug }: { organizationSlug?: string | null }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const privatePath = privateGuidePath(organizationSlug)
  // 以前の「貸切の流れ」のリンク（?section=private）は、独立した貸切の流れのページへ移す
  useEffect(() => {
    if (new URLSearchParams(search).get('section') === 'private') navigate(privatePath, { replace: true })
  }, [navigate, privatePath, search])
  const meta = STATIC_PUBLIC_META.guide
  usePageMeta({ title: meta.title, description: meta.description, canonicalPath: meta.path })

  return (
    <PublicLayout>
      <JsonLd data={buildFaqJsonLd([...MURDER_MYSTERY_FAQ])} />
      {/* ヒーロー */}
      <section className="relative overflow-hidden py-10 md:py-14" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="max-w-2xl mx-auto px-4 relative text-center">
          <div className="flex items-center justify-center gap-2 text-white/80 ts-body mb-4">
            <Link to="/" className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" />
            <span>使い方ガイド</span>
          </div>
          <h1 className="text-white mb-3 flex items-center justify-center gap-3">
            <HelpCircle className="w-7 h-7 sm:w-8 sm:h-8" />
            ご予約ガイド
          </h1>
          <p className="text-white/90">公演の予約と、貸切の流れをご案内します</p>
        </div>
      </section>

      <GuideEntryLinks entries={[
        { title: '公演を予約する流れ', description: '空いている公演を探して、人数を選んで予約', icon: <CalendarCheck className="w-5 h-5" />, scrollToId: BOOKING_STEPS_ID, testId: 'guide-entry-booking' },
        { title: '貸切の流れ', description: '友だちと作品と日にちを決めて、店舗に申し込む', icon: <Users className="w-5 h-5" />, to: privatePath, testId: 'guide-entry-private' },
      ]} />

      <Section>
        <h2>マーダーミステリー（マダミス）とは</h2>
        <Body>
          マーダーミステリー（通称マダミス）は、参加者が物語の登場人物になりきり、会話と推理で事件の真相を探る体験型ゲームです。同じ作品は原則一度きり。店舗の公演で、初めての方も楽しめます。
        </Body>
        <Body>MMQ では参加店舗の公演を探して、そのまま予約できます。</Body>
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      {/* ===== 1 ===== */}
      <Section id={BOOKING_STEPS_ID}>
        <StepHeading n={1} title="空いている公演を探す" lead="店舗の予約ページのいちばん上です" />
        <Body>
          予約ページを開くと「空いている公演を探す」が出ます。「今週」「来週」「今月」で日付を選ぶと、その期間に空きのある公演が一覧で出ます。店舗でも絞り込めます。
        </Body>
        <GuideShot src={`${IMG}/top.webp`} alt="予約ページの上部。空いている公演を探す、日付のチップ、カレンダーとリストのチップ、人数と店舗の絞り込み、公演の一覧" caption="予約ページ（スマホ）" />
        <Annotation>公演の行を押すと、その公演を選んだ状態で作品ページが開きます</Annotation>
        <Body>
          日付から探したいときは「カレンダー」、店舗と時間帯を並べて見たいときは「リスト」を押すと、表示が切り替わります。作品名から探したいときは、ページの下の「作品から探す」で作品名や作者名を入れてください。
        </Body>
        <GuideShot src={`${IMG}/calendar.webp`} alt="カレンダーで表示した公演。日ごとに公演と残り席が並ぶ" caption="「カレンダー」を押したところ" />
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      {/* ===== 2 ===== */}
      <Section>
        <StepHeading n={2} title="作品ページで公演を選ぶ" lead="日付の一覧から「選択」を押します" />
        <Body>
          作品ページの「日付を選択」に、その作品の公演が並びます。行きたい公演の「選択」を押すと「選択中」に変わります。店舗で絞り込むこともできます。
        </Body>
        <GuideShot src={`${IMG}/select.webp`} alt="作品ページの日付の一覧。選んだ公演は選択中になっている" caption="公演を選んだところ" />
        <Annotation>残りの席が少ない公演は「残りわずか」、あと少しで開催が決まる公演は「成立間近」と出ます</Annotation>
        <Body>満席の公演は「キャンセル待ち」を登録できます。空きが出るとお知らせします。</Body>
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      {/* ===== 3 ===== */}
      <Section>
        <StepHeading n={3} title="人数を選んで予約する" lead="予約のボタンは画面の下にずっと出ています" />
        <Body>
          「人数を選択」で予約する人数を選びます（一覧から選ぶ形です）。料金は税込で、当日、店舗で現金またはカードでお支払いください。
        </Body>
        <GuideShot src={`${IMG}/count.webp`} alt="人数を選択の欄、会場、料金。画面の下に合計金額と予約のボタン" caption="人数と料金" />
        <Annotation>画面の下のボタンで予約に進みます。ログインしていないときは「ログインして予約する」と出ます</Annotation>
        <Body>次の画面で内容とキャンセルの期限を確かめて、予約を確定します。</Body>
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      {/* ===== 4 ===== */}
      <Section>
        <StepHeading n={4} title="予約完了。あとはマイページで" lead="確認・人数の変更・取消ができます" />
        <Body>
          予約が終わると、確認のメールが届きます。メールには、無料で取り消せる期限の日時、当日のお支払い、マイページへのリンクが書いてあります。
        </Body>
        <Body>
          マイページの予約の詳細から、人数の変更と取消ができます。無料で取り消せる期限を過ぎたあとは、店舗への問い合わせフォームからご連絡ください。期限と料金は、各店舗の
          <Link to="/cancel-policy" className="underline text-primary mx-0.5">キャンセルポリシー</Link>
          にも載っています。
        </Body>
      </Section>

      {/* ===== 貸切（詳しくは貸切の流れのページ） ===== */}
      <Section id="private-booking-guide" tinted>
        <StepHeading n="貸" title="友だちと貸切で遊ぶ" lead="4〜8 人集まれば、好きな作品を好きな日に" />
        <Body>
          貸切は、グループを作ってメンバーを招待し、候補日の都合を聞いてから店舗に申し込みます。申込から当日、公演後までの流れは「貸切の流れ」のページにまとめています。
        </Body>
        <Link to={privatePath} data-testid="guide-private-link">
          <Button size="lg" className="font-bold" style={{ backgroundColor: THEME.primary }}>
            <Users className="w-5 h-5 mr-2" aria-hidden="true" />
            貸切の流れを見る
            <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
          </Button>
        </Link>
      </Section>

      {/* CTA */}
      <section className="py-10 md:py-12" style={{ backgroundColor: THEME.primaryLight }}>
        <div className="max-w-2xl mx-auto px-4 text-center space-y-4">
          <h2>さっそく公演を探してみましょう</h2>
          <p className="ts-body text-muted-foreground">分からないことは<Link to="/faq" className="underline text-primary mx-0.5">よくある質問</Link>もご覧ください。</p>
          <Link to="/">
            <Button size="lg" className="px-8 font-bold" style={{ backgroundColor: THEME.primary }}>
              公演を探す
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
