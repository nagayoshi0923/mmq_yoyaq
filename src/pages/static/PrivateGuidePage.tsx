/**
 * 貸切の流れ（貸切予約ガイド）
 * @path /guide/private（組織付き /{org}/guide/private も同じ内容）
 *
 * 2026-10-14 社長指示で使い方ガイドの「貸切予約ガイド」の節から独立させ、今の仕様に書き直した。
 * 正本: docs/product-spec/グループページ刷新_2026-10.md・マイページ改修_2026-10.md・貸切受付ルール.md、docs/ops/FAQ_貼り替え文_2026-10.md。
 * 画面例は実際の部品に見本の値を入れたもの（guide/PrivateGuideDemos.tsx）。画像は使わない。
 * 仕様や画面の文言を変えたら、このページの文も合わせる。
 */
import type { ReactNode } from 'react'
import { ArrowRight, CalendarCheck, ChevronRight, HelpCircle, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Button } from '@/components/ui/button'
import { JsonLd } from '@/components/seo/JsonLd'
import { usePageMeta } from '@/hooks/usePageMeta'
import { MYPAGE_THEME as THEME } from '@/lib/theme'
import { STATIC_PUBLIC_META, buildFaqJsonLd } from '@/lib/seo'
import { privateCancelNoticeText } from '@/lib/privateCancelNotice'
import { Annotation, DemoPrivateCard } from './guide/GuideDemos'
import { Body, Faq, GuideEntryLinks, Section, StepHeading, SubStep } from './guide/GuideParts'
import { PRIVATE_GUIDE_FAQ, PRIVATE_GUIDE_STEPS } from './guide/privateGuideContent'
import { DemoAfter, DemoAnswerTable, DemoChooseCasting, DemoGroupOverviewTop, DemoRequestSheet, DemoWaitingStore } from './guide/PrivateGuideDemos'

function Bullets({ items }: { items: ReadonlyArray<string> }) {
  return (
    <ul className="ts-body text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
      {items.map(item => <li key={item}>{item}</li>)}
    </ul>
  )
}

function StepSection({ n, lead, children, tinted }: { n: number; lead?: string; children: ReactNode; tinted?: boolean }) {
  return (
    <Section tinted={tinted}>
      <StepHeading n={n} title={PRIVATE_GUIDE_STEPS[n - 1]} lead={lead} />
      {children}
    </Section>
  )
}

export function PrivateGuidePage({ organizationSlug }: { organizationSlug?: string | null }) {
  const meta = STATIC_PUBLIC_META['guide-private']
  usePageMeta({ title: meta.title, description: meta.description, canonicalPath: meta.path })
  const base = organizationSlug ? `/${organizationSlug}` : ''
  const cancelPolicyPath = `${base}/cancel-policy`
  const faqPath = `${base}/faq`

  return (
    <PublicLayout>
      <JsonLd data={buildFaqJsonLd([...PRIVATE_GUIDE_FAQ])} />
      {/* ヒーロー */}
      <section className="relative overflow-hidden py-10 md:py-14" style={{ backgroundColor: THEME.primary }}>
        <div className="absolute top-0 right-0 w-64 h-64 opacity-20" style={{ background: `radial-gradient(circle at center, ${THEME.accent} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }} />
        <div className="max-w-2xl mx-auto px-4 relative text-center">
          <nav aria-label="パンくず" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-white/80 ts-body mb-4">
            <Link to={base || '/'} className="hover:text-white transition-colors">ホーム</Link>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
            <Link to={`${base}/guide`} className="hover:text-white transition-colors">使い方ガイド</Link>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
            <span>貸切の流れ</span>
          </nav>
          <h1 className="text-white mb-3 flex items-center justify-center gap-3">
            <Users className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
            貸切の流れ
          </h1>
          <p className="text-white/90">友だちと好きな作品を、好きな日に</p>
        </div>
      </section>

      <GuideEntryLinks entries={[
        { title: '公演を予約する流れ', description: '空いている公演を探して、人数を選んで予約', icon: <CalendarCheck className="w-5 h-5" />, to: `${base}/guide`, testId: 'private-guide-entry-booking' },
      ]} />

      <Section>
        <h2>貸切でできること</h2>
        <Body>
          4〜8 人ほど集まれば、好きな作品を好きな日に貸切で遊べます（人数は作品によって違います）。候補日を出してメンバーの都合を聞き、店舗に申し込むまで、このサイトの中で進められます。
        </Body>
        <Bullets items={[
          '料金は税込で、当日お一人ずつ店舗でお支払いください（現金またはカード）。料金は参加人数分です。',
          '参加人数が作品の最低人数に満たないと、公演は成立しません。',
          '申し込めるのは公演日の 14 日前までです（店舗によって違う場合があります）。',
        ]} />
        <div className="bg-card rounded-lg border border-border p-4 sm:p-5">
          <h3 className="mb-2">流れ</h3>
          <ol className="ts-body text-muted-foreground leading-relaxed list-decimal pl-5 grid gap-x-6 gap-y-1 sm:grid-cols-2" data-testid="private-guide-steps">
            {PRIVATE_GUIDE_STEPS.map(step => <li key={step}>{step}</li>)}
          </ol>
        </div>
      </Section>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={1} lead="作品を選んでグループを作ります">
        <Body>
          予約ページの「貸切で遊ぶ」から貸切できる作品を選び、グループを作ります。作品ページの「貸切リクエスト」のタブにある「まずはメンバーを招待して貸切グループを作成」からも、同じようにグループを作れます。
        </Body>
        <Body>グループを作れるのは会員（ログインした方）です。グループを作った方が主催者になります。</Body>
        <Annotation>貸切は、公演日の 14 日前まで申し込めます（店舗によって違う場合があります）</Annotation>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={2} lead="招待リンクを送ります">
        <Body>
          グループページの「招待リンクを送る」から、LINE などでリンクを送ります。受け取った方は、会員でなくても、お名前とメールアドレスだけで「ゲスト」として参加できます。会員の方はログインして参加します。
        </Body>
        <SubStep n={1} title="ゲストの PIN">
          <Body>
            ゲストで参加すると、4 桁の PIN が画面に出て、メールにも届きます。次にグループに入るときは、メールアドレスとこの PIN を入れます。PIN を忘れたときは、招待リンクを開いて PIN をもう一度メールで受け取れます。
          </Body>
        </SubStep>
        <SubStep n={2} title="ゲストができること・できないこと">
          <Bullets items={[
            'できること: 日程の回答、チャット、写真の共有、事前配役アンケートへの回答',
            'できないこと: マイページを使うこと、主催者を引き継ぐこと（会員の登録が必要です）',
          ]} />
        </SubStep>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={3} lead="いちばん上の箱が「次にやること」です">
        <Body>
          グループページのいちばん上に「いまの状態」の箱があります。次にやることと、そのためのボタンがここにまとまっています。迷ったら、まずこの箱を見てください。
        </Body>
        <DemoGroupOverviewTop />
        <Body>
          その下のタブで「概要」「日程」「メンバー」「チャット」を切り替えます。概要には、作品について・登場人物・日程と場所・事前配役アンケート・参加メンバー・料金・店舗とのやりとり・注意事項がまとまっています。
        </Body>
        <Body>会員の方は、マイページの「貸切」にも貸切 1 件ごとのカードが出ます。カードのボタンからグループページを開けます。</Body>
        <DemoPrivateCard />
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={4} lead="主催者が候補日を出し、メンバーが都合を答えます">
        <SubStep n={1} title="主催者が候補日を追加する">
          <Body>
            箱の「候補日を追加」を押すと、候補日を選ぶ画面が開きます。店舗の営業時間内で、休業日やほかの公演と重ならない枠だけを選べます。選べない枠には理由が出ます。今日から 14 日以内の日は選べません（店舗によって違う場合があります）。
          </Body>
        </SubStep>
        <SubStep n={2} title="メンバーが ○△× を答える">
          <Body>
            「日程」タブの表で、自分の列（「あなた」）の丸を押すと ○ → △ → × と変わり、その場で保存されます。いちばん集まっている候補日は薄紫になります。
          </Body>
        </SubStep>
        <DemoAnswerTable />
        <Annotation>主催者は、表の下の「未回答の人に知らせる」で回答をお願いできます</Annotation>
        <Body>回答がそろうと、主催者の箱が「申込に進む」になり、「候補日を選んで店舗に申し込む」のボタンが出ます。</Body>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={5} lead="候補日に優先順を付けて送ります">
        <Body>
          主催者が箱の「候補日を選んで店舗に申し込む」を押すと、申込シートが開きます。送る候補日を選び（複数可）、上から優先の順に並べます。希望の店舗も選べます。
        </Body>
        <DemoRequestSheet />
        <Bullets items={[
          '参加人数は作品の人数です。人数が決まっていない作品は、申し込むときに人数を選びます。',
          '注意事項とキャンセル規定を確かめて申し込むと、「店舗の返事待ち」になります。申し込んだあとは候補日を増やせません。',
        ]} />
        <DemoWaitingStore />
        <Body>
          店舗が候補日の中から 1 つを選んで確定すると、その日時が正式な公演の日時になります。メールとベルのお知らせで連絡します。店舗が申込を見送ったときは、理由と一緒にお知らせします。
        </Body>
        <Annotation>店舗の返事を待つあいだは、主催者が「申込を取り下げる」ことができます（キャンセル料はかかりません）</Annotation>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={6} lead="配役・カレンダー・連絡">
        <SubStep n={1} title="事前配役アンケート">
          <Body>
            作品によっては、日程が確定したあとに配役を決めます。主催者が箱で決め方を選びます。
          </Body>
          <Bullets items={[
            '事前配役アンケートで希望を伝える: 全員がアンケートに答え、店舗と GM が配役を決めます（回答はメンバーには見えません）。',
            '自分たちで決める: メンバーがやりたいキャラクターを選び、主催者が配役を確定します。',
          ]} />
          <DemoChooseCasting />
          <Body>箱は「配役の決め方を選ぶ」→「やりたいキャラクターを選ぶ」→「配役を確定する」の順に進みます。</Body>
        </SubStep>
        <SubStep n={2} title="カレンダーと地図">
          <Body>箱の「カレンダーに登録」で、公演の日時をスマホやパソコンのカレンダーに入れられます。「地図を開く」で店舗の場所を確かめられます。</Body>
        </SubStep>
        <SubStep n={3} title="チャットで連絡する">
          <Body>
            「チャット」タブでメンバーと相談できます。写真は 1 回に 10 枚まで送れます。チャットと写真はグループのメンバーだけが見られ、期限なく残ります。発言を長押しすると、返信・リアクション・コピーができます。主催者は大事な発言をピン留めできます。
          </Body>
        </SubStep>
        <SubStep n={4} title="通知">
          <Body>
            新しい発言や店舗からの返事は、スマホの通知で受け取れます（会員の方）。グループに参加したあとや、初めて発言したあとに出る案内で「受け取る」を押してください。iPhone では、Safari の共有ボタンから「ホーム画面に追加」して、ホーム画面の MMQ から開くと受け取れます。
          </Body>
          <Body>ゲストの方には、読んでいない発言があると、1 日 1 回メールでまとめてお知らせします。</Body>
        </SubStep>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={7} lead="開演の 10 分前にお越しください">
        <Body>
          開演の 10 分前までに店舗にお越しください。料金は、お一人ずつ店舗でお支払いください（税込。現金またはカード）。
        </Body>
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={8} lead="思い出を残す">
        <Body>
          公演が終わると、タブが「思い出」「メンバー」「チャット」に変わります。思い出タブに写真を共有したり、感想を書いたりできます。
        </Body>
        <DemoAfter />
        <Bullets items={[
          '「同じメンバーで次の貸切」から、次の作品のグループを作れます（会員の方）。',
          '公演後のアンケート（感想）は任意です。回答は店舗（GM を含む）にだけ届き、メンバーには見えません。',
        ]} />
      </StepSection>

      <hr className="max-w-3xl mx-auto border-border" />

      <StepSection n={9} lead="主催者の交代・メンバーの出入り・取消">
        <SubStep n={1} title="主催者を代わってもらう">
          <Body>
            主催者は、会員のメンバーに主催者の引き継ぎを頼めます。相手が注意事項と取消の規定に同意すると交代します。依頼は 72 時間で期限が切れます。ゲストの方には引き継げません。
          </Body>
        </SubStep>
        <SubStep n={2} title="メンバーを足す・外す">
          <Body>
            招待リンクを送れば、あとからメンバーを足せます。主催者はメンバータブの「管理」からメンバーを外せます。メンバーは自分でグループから抜けられます。申し込んだあとに人数が変わると、店舗に人数の変更として伝わります。
          </Body>
        </SubStep>
        <SubStep n={3} title="やめるとき">
          <Bullets items={[
            '店舗に申し込む前: 「グループを閉じる」',
            '店舗の返事待ちのあいだ: 「申込を取り下げる」（キャンセル料はかかりません）',
            '日程が確定したあと: 「キャンセル」',
          ]} />
          <Body>
            どれも主催者が、グループページ右上の「⋮」の「操作」か、マイページの貸切カードの「操作」から選びます。{privateCancelNoticeText()}詳しくは各店舗の
            <Link to={cancelPolicyPath} className="underline text-primary mx-0.5">キャンセルポリシー</Link>
            をご覧ください。
          </Body>
        </SubStep>
      </StepSection>

      {/* よくある質問 */}
      <Section tinted>
        <div className="bg-card rounded-lg border border-violet-200 p-4 sm:p-5 space-y-4" data-testid="private-guide-faq">
          <h2 className="flex items-center gap-2"><HelpCircle className="w-5 h-5" aria-hidden="true" />貸切でよくある質問</h2>
          {PRIVATE_GUIDE_FAQ.map(item => <Faq key={item.question} q={item.question}>{item.answer}</Faq>)}
        </div>
      </Section>

      {/* CTA */}
      <section className="py-10 md:py-12" style={{ backgroundColor: THEME.primaryLight }}>
        <div className="max-w-2xl mx-auto px-4 text-center space-y-4">
          <h2>貸切できる作品を探してみましょう</h2>
          <p className="ts-body text-muted-foreground">分からないことは<Link to={faqPath} className="underline text-primary mx-0.5">よくある質問</Link>もご覧ください。</p>
          <Link to={base || '/'}>
            <Button size="lg" className="px-8 font-bold" style={{ backgroundColor: THEME.primary }}>
              予約ページへ
              <ArrowRight className="w-5 h-5 ml-2" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
