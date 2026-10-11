/**
 * 初めての方へ / 使い方ガイドページ
 * @path /guide
 *
 * 2026-10-11 点検 22 で今の画面に合わせて書き直し。
 * 画面例: ログイン不要の画面は 375px の実画面の画像（public/guide-images/）、
 * マイページ・グループページは実際の部品に見本の値を入れたもの（guide/GuideDemos.tsx）。
 * 画面を変えたら、画像を撮り直してこのページの文も合わせる。
 */
import { useEffect, type ReactNode } from 'react'
import { ArrowRight, ChevronRight, HelpCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { JsonLd } from '@/components/seo/JsonLd'
import { usePageMeta } from '@/hooks/usePageMeta'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { STATIC_PUBLIC_META, buildFaqJsonLd, MURDER_MYSTERY_FAQ } from '@/lib/seo'
import { Annotation, DemoGroupTop, DemoPrivateCard, GuideShot } from './guide/GuideDemos'

const IMG = '/guide-images'

function StepHeading({ n, title, lead }: { n: number | string; title: string; lead?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: THEME.primary }}
      >
        {n}
      </div>
      <div>
        <h2>{title}</h2>
        {lead && <p className="ts-muted mt-0.5">{lead}</p>}
      </div>
    </div>
  )
}

function Section({ children, id, tinted = false }: { children: ReactNode; id?: string; tinted?: boolean }) {
  return (
    <section id={id} className={`scroll-mt-4 ${tinted ? 'bg-violet-50/60' : ''}`}>
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-10 space-y-4">{children}</div>
    </section>
  )
}

function SubStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center ts-label">{n}</span>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Body({ children }: { children: ReactNode }) {
  return <p className="ts-body text-muted-foreground leading-relaxed">{children}</p>
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="ts-label">Q. {q}</p>
      <p className="ts-body text-muted-foreground leading-relaxed">{children}</p>
    </div>
  )
}

export function GuidePage() {
  // トップの「貸切の流れ」から ?section=private で来たら貸切予約ガイドへ（# のリンクはアプリがパスに変えるため使わない）
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('section') !== 'private') return
    const t = window.setTimeout(() => document.getElementById('private-booking-guide')?.scrollIntoView({ behavior: 'smooth' }), 200)
    return () => window.clearTimeout(t)
  }, [])
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
          <p className="text-white/90">公演の予約は 4 つの手順でできます</p>
        </div>
      </section>

      <Section>
        <h2>マーダーミステリー（マダミス）とは</h2>
        <Body>
          マーダーミステリー（通称マダミス）は、参加者が物語の登場人物になりきり、会話と推理で事件の真相を探る体験型ゲームです。同じ作品は原則一度きり。店舗の公演で、初めての方も楽しめます。
        </Body>
        <Body>MMQ では参加店舗の公演を探して、そのまま予約できます。</Body>
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      {/* ===== 1 ===== */}
      <Section>
        <StepHeading n={1} title="空いている公演を探す" lead="店舗の予約ページのいちばん上です" />
        <Body>
          予約ページを開くと「空いている公演を探す」が出ます。「今週末」「今日」「明日」「来週」で日付を選ぶと、その日に入れる公演が一覧で出ます。人数と店舗でも絞り込めます。
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

      {/* ===== 貸切 ===== */}
      <Section id="private-booking-guide" tinted>
        <StepHeading n="貸" title="貸切予約ガイド" lead="友だちと好きな作品を、好きな日に" />
        <Body>
          4〜8 人ほど集まれば、作品と日にちを選んで貸切にできます。候補日を決めてメンバーの都合を聞き、店舗に申し込むまでをグループページで進めます。
        </Body>

        <SubStep n={1} title="作品ページの「貸切リクエスト」を開く">
          <Body>
            作品ページで「公演日程」の隣の「貸切リクエスト」を押します。日程やメンバーが決まっていないときは「まずはメンバーを招待して貸切グループを作成」を押してください。予約ページの「貸切で遊ぶ」からも始められます。
          </Body>
          <GuideShot src={`${IMG}/private.webp`} alt="作品ページの貸切リクエストのタブ。グループの作成、希望の店舗と日程の選択" caption="貸切リクエストのタブ" />
          <Annotation>貸切は、公演日の 14 日前まで申し込めます（店舗によって違う場合があります）</Annotation>
        </SubStep>

        <SubStep n={2} title="招待リンクを送ってメンバーを集める">
          <Body>
            グループができたら、グループページの「招待リンクを送る」から LINE などでリンクを送ります。受け取った人は、MMQ に登録していなくても、お名前とメールアドレスを入れて「ゲスト」として参加できます。
          </Body>
          <Body>
            ゲストで参加すると 4 桁の PIN が表示されます。あとでグループに戻るときは、メールアドレスとこの PIN を入れます。忘れたときは招待ページから PIN をメールで受け取れます。
          </Body>
        </SubStep>

        <SubStep n={3} title="グループページで日程を決める">
          <Body>
            グループページのいちばん上の箱に、いまの状態と次にやることが出ます。その下の「概要」「日程」「メンバー」「チャット」で切り替えます。
          </Body>
          <DemoGroupTop />
          <Body>
            主催者が候補日を入れると、メンバーは「日程」で○△×を回答します。回答がそろったら、主催者が「候補日を選んで店舗に申し込む」を押します。複数の候補日を送ると、店舗がその中から 1 つ確定します。
          </Body>
          <Body>
            「チャット」ではメンバー同士で相談できます。チャットと写真はグループのメンバーだけが見られます。自分の投稿はあとから消せます。
          </Body>
        </SubStep>

        <SubStep n={4} title="マイページの「貸切」で次にやることを確かめる">
          <Body>
            マイページの「貸切」には、貸切 1 件ごとにカードが出ます。カードの上の色の付いたラベルが次にやることです。ボタンを押すと、その画面が開きます。
          </Body>
          <DemoPrivateCard />
          <Annotation>カード右上の「操作」から、招待リンクのコピーや店舗への問い合わせができます</Annotation>
        </SubStep>

        <SubStep n={5} title="店舗が日程を確定">
          <Body>
            店舗が日程を確定すると、メール・ベルのお知らせ・プッシュ通知（許可した場合）でお知らせします。作品によっては、事前配役アンケートで、やりたい役の希望を店舗に伝えます（回答は店舗と GM だけが見ます）。
          </Body>
        </SubStep>

        <div className="bg-card rounded-lg border border-violet-200 p-4 sm:p-5 space-y-4">
          <h3 className="flex items-center gap-2"><HelpCircle className="w-5 h-5" aria-hidden="true" />貸切でよくある質問</h3>
          <Faq q="メンバー全員が MMQ に登録する必要がありますか">
            いいえ。店舗への申込には主催者のログインが要りますが、メンバーはゲストとして参加できます。
          </Faq>
          <Faq q="メンバー全員をグループに入れないといけませんか">
            全員でなくても公演はできます。ただし、事前に資料を読む作品は、資料をグループで配るため全員の参加が必要です。
          </Faq>
          <Faq q="主催者を代わってもらえますか">
            はい。メンバーの管理（マイページの貸切カードの「操作」、またはグループページ右上のメニュー）から、ほかのメンバーに主催者の引き継ぎを頼めます。相手が同意すると、その人が申込者（店舗への連絡先・キャンセル料の負担者）になります。
          </Faq>
          <Faq q="作った貸切グループを閉じたい・申込を取り下げたい">
            マイページの貸切カードの「操作」、またはグループページ右上のメニューから選べます。店舗へ申し込む前は「グループを閉じる」、返事待ちのあいだは「申込を取り下げる」、日程が確定したあとは「キャンセル」（キャンセルポリシーの範囲内）です。
          </Faq>
        </div>
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
