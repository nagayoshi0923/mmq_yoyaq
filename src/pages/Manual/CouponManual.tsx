import { Badge } from '@/components/ui/badge'
import {
  Ticket, Plus, Gift, BarChart3, Power,
  Search, CheckCircle, AlertCircle, Info,
  ToggleLeft, ToggleRight, Users, Calendar, Tag
} from 'lucide-react'

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function StepCard({ step, title, description, children }: {
  step: number
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
          {step}
        </span>
        <div className="space-y-2 flex-1">
          <h4 className="font-medium">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
          {children && (
            <div className="bg-background rounded-md p-3 text-sm space-y-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoBox({ type = 'info', children }: { type?: 'info' | 'warning' | 'success'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  }
  const icons = {
    info: <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />,
    warning: <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />,
    success: <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />,
  }
  return (
    <div className={`border rounded-md p-4 flex gap-2 text-sm ${styles[type]}`}>
      {icons[type]}
      <div>{children}</div>
    </div>
  )
}

function FieldRow({ label, content }: { label: string; content: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 items-start py-2 border-b border-muted last:border-0">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{content}</span>
    </div>
  )
}

export function CouponManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      {/* 概要 */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">クーポン管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          クーポン機能を使うと、お客さまに割引クーポンを配布・管理できます。
          新規登録時の自動付与や手動での個別付与に対応しており、使用状況の統計確認も可能です。
        </p>
      </div>

      {/* クーポンの全体像 */}
      <Section icon={Ticket} title="クーポンの仕組み">
        <p className="text-sm text-muted-foreground leading-relaxed">
          クーポンは「キャンペーン」と「顧客クーポン」の2層構造で管理されています。
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Tag className="h-4 w-4 text-primary" />
              キャンペーン
            </div>
            <p className="text-sm text-muted-foreground">
              「割引額」「有効期間」「付与条件」などのルールを定義したテンプレートです。
              まずキャンペーンを作成し、そこからお客さまへ付与します。
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4 text-primary" />
              顧客クーポン
            </div>
            <p className="text-sm text-muted-foreground">
              キャンペーンをもとに各お客さまへ付与された実際のクーポンです。
              お客さまのマイページから確認・使用できます。
            </p>
          </div>
        </div>

        <InfoBox type="info">
          <strong>ページへのアクセス：</strong>
          ナビゲーションバーの「クーポン管理」、またはサイドメニューから開けます。
        </InfoBox>
      </Section>

      {/* キャンペーンの作成 */}
      <Section icon={Plus} title="キャンペーンを作成する">
        <p className="text-sm text-muted-foreground">
          クーポンを配布するには、まずキャンペーンを作成します。
        </p>

        <div className="space-y-3">
          <StepCard
            step={1}
            title="「新規キャンペーン」ボタンをクリック"
            description="クーポン管理ページ右上のボタンから作成ダイアログを開きます。"
          />
          <StepCard
            step={2}
            title="キャンペーン情報を入力"
            description="各項目を入力して「作成」ボタンを押します。"
          >
            <div className="space-y-0.5">
              <FieldRow
                label="キャンペーン名"
                content="管理用の名前。例：「新規登録クーポン500円OFF」"
              />
              <FieldRow
                label="説明"
                content="お客さまのマイページに表示される説明文"
              />
              <FieldRow
                label="割引タイプ"
                content={
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">固定額</Badge>
                    <span className="text-muted-foreground text-xs">例：500円OFF</span>
                    <span className="mx-1">／</span>
                    <Badge variant="outline">割引率</Badge>
                    <span className="text-muted-foreground text-xs">例：10%OFF</span>
                  </div>
                }
              />
              <FieldRow
                label="割引額・割引率"
                content="固定額なら「500」（円）、割引率なら「10」（%）のように入力"
              />
              <FieldRow
                label="使用回数上限"
                content="1人のお客さまが何回使えるか。通常は「1」"
              />
              <FieldRow
                label="有効日数"
                content="付与してから何日間有効か。空欄にすると無制限"
              />
              <FieldRow
                label="付与方法"
                content={
                  <div className="space-y-1">
                    <div><Badge className="bg-blue-100 text-blue-700 mr-1">新規登録時</Badge>新規会員登録したお客さまへ自動付与</div>
                    <div><Badge variant="outline" className="mr-1">手動付与</Badge>スタッフが個別に付与する場合</div>
                  </div>
                }
              />
              <FieldRow
                label="対象範囲"
                content={
                  <div className="space-y-1">
                    <div><Badge variant="outline" className="mr-1">全予約</Badge>どのシナリオの予約でも使用可能</div>
                    <div><Badge variant="outline" className="mr-1">特定シナリオのみ</Badge>指定したシナリオの予約にのみ使用可能</div>
                  </div>
                }
              />
              <FieldRow
                label="キャンペーン期間"
                content="開始日・終了日を設定。空欄にすると期限なし"
              />
              <FieldRow
                label="有効"
                content="スイッチをオンにするとキャンペーンが有効になる"
              />
            </div>
          </StepCard>
        </div>

        <InfoBox type="success">
          <strong>新規登録キャンペーンを設定すると、</strong>以降に登録したお客さまへ自動でクーポンが付与されます。
          既存のお客さまには付与されないため、手動付与で対応してください。
        </InfoBox>
      </Section>

      {/* 手動付与 */}
      <Section icon={Gift} title="お客さまにクーポンを手動付与する">
        <p className="text-sm text-muted-foreground">
          「手動付与」タイプのキャンペーン、または新規登録キャンペーンを既存のお客さまにも配布したい場合に使います。
        </p>

        <div className="space-y-3">
          <StepCard
            step={1}
            title="キャンペーン一覧でメニューを開く"
            description="付与したいキャンペーンのカード右端にある「︙」（縦三点）アイコンをクリックします。"
          />
          <StepCard
            step={2}
            title="「クーポン付与」を選択"
            description="ドロップダウンメニューから「クーポン付与」をクリックすると、検索ダイアログが開きます。"
          />
          <StepCard
            step={3}
            title="お客さまを検索して付与"
            description="名前・メールアドレス・電話番号で検索し、対象のお客さまを選んで「付与する」を押します。"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              <span>2文字以上入力すると検索結果が表示されます</span>
            </div>
          </StepCard>
        </div>

        <InfoBox type="warning">
          同じお客さまへの重複付与はシステムで防止されています。
          「既にこのクーポンが付与されています」と表示された場合は、すでに付与済みです。
        </InfoBox>
      </Section>

      {/* 有効/無効の切り替え */}
      <Section icon={Power} title="キャンペーンの有効・無効を切り替える">
        <p className="text-sm text-muted-foreground">
          キャンペーンを一時停止したい場合は、スイッチ操作で有効/無効を切り替えられます。
        </p>

        <div className="bg-muted/30 rounded-lg p-5 space-y-4">
          <div className="flex items-start gap-3">
            <ToggleRight className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">有効（オン）</p>
              <p className="text-sm text-muted-foreground">
                新規登録キャンペーンは新しいお客さまへ自動付与されます。
                既に付与済みのクーポンもお客さまが使用できます。
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ToggleLeft className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">無効（オフ）</p>
              <p className="text-sm text-muted-foreground">
                新規登録時の自動付与が停止します。
                ただし既に付与済みのクーポンは引き続きお客さまが使用できます。
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          キャンペーンカード右側のスイッチを切り替えると即座に反映されます。
        </p>
      </Section>

      {/* 統計確認 */}
      <Section icon={BarChart3} title="使用状況（統計）を確認する">
        <p className="text-sm text-muted-foreground">
          各キャンペーンの付与数・使用数・割引総額を確認できます。
        </p>

        <div className="space-y-3">
          <StepCard
            step={1}
            title="「統計を見る」を選択"
            description="キャンペーンカードの「︙」メニューから「統計を見る」をクリックします。"
          />
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium">表示される統計情報</div>
          <div className="divide-y">
            <div className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">付与数</span>
              <span>このキャンペーンで付与したクーポンの総数</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">使用数</span>
              <span>実際に使われたクーポンの数</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">未使用数</span>
              <span>まだ使われていないクーポンの数</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">割引総額</span>
              <span>このキャンペーンで発生した割引の合計金額</span>
            </div>
          </div>
        </div>
      </Section>

      {/* お客さまの使い方 */}
      <Section icon={Users} title="お客さまがクーポンを使う流れ">
        <p className="text-sm text-muted-foreground">
          お客さまがクーポンを受け取ってから使うまでの流れです。スタッフが把握しておくと、お客さまからの問い合わせに対応しやすくなります。
        </p>

        <div className="space-y-3">
          <StepCard
            step={1}
            title="クーポンを受け取る"
            description="新規登録時に自動付与されるか、スタッフが手動付与します。マイページの「クーポン」タブに表示されます。"
          />
          <StepCard
            step={2}
            title="予約時にクーポンを選択"
            description="予約確認画面でクーポンを選択すると、割引が適用された料金が表示されます。"
          >
            <p>クーポンは予約確認画面（お支払い情報を入力するステップ）でのみ選択できます。</p>
          </StepCard>
          <StepCard
            step={3}
            title="使用完了"
            description="予約が確定するとクーポンが消費されます。使用回数が0になると「使用済み」になります。"
          />
        </div>

        <InfoBox type="info">
          <strong>同タイトルへの重複使用防止：</strong>
          同じシナリオ（タイトル）の公演に対しては、クーポンを2回以上使用できません。
          異なるシナリオの公演であれば、残り回数の範囲内で使用できます。
        </InfoBox>
      </Section>

      {/* よくある質問・注意事項 */}
      <Section icon={AlertCircle} title="よくある質問・注意事項">
        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-2">
            <p className="font-medium text-sm">Q. キャンペーンを削除できますか？</p>
            <p className="text-sm text-muted-foreground">
              現在、キャンペーンの削除機能はありません。不要なキャンペーンは「無効」にして非表示状態にしてください。
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <p className="font-medium text-sm">Q. 付与済みのクーポンを取り消せますか？</p>
            <p className="text-sm text-muted-foreground">
              管理画面からのクーポン取り消しには現在対応していません。誤って付与した場合はお問い合わせください。
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <p className="font-medium text-sm">Q. 新規登録キャンペーンは複数設定できますか？</p>
            <p className="text-sm text-muted-foreground">
              はい。有効な新規登録キャンペーンが複数ある場合、登録時に全てのキャンペーンのクーポンが付与されます。
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <p className="font-medium text-sm">Q. お客さまがクーポンを持っているか確認できますか？</p>
            <p className="text-sm text-muted-foreground">
              「顧客管理」ページでお客さまを検索し、詳細を開くと保有クーポンを確認できます。
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <p className="font-medium text-sm">Q. クーポンの有効期限はどう決まりますか？</p>
            <p className="text-sm text-muted-foreground">
              キャンペーンに設定した「有効日数」（付与日から）と「キャンペーン終了日」のいずれか早い方が有効期限になります。
              どちらも未設定の場合は無期限です。
            </p>
          </div>
        </div>
      </Section>

      {/* キャンペーン一覧の見方 */}
      <Section icon={Calendar} title="キャンペーン一覧の見方">
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 text-sm font-medium">表示される情報</div>
          <div className="divide-y">
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">キャンペーン名</span>
              <span>作成時に設定した名前</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">
                <Badge className="bg-blue-100 text-blue-700">新規登録時</Badge>
              </span>
              <span>新規登録で自動付与されるキャンペーン</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">
                <Badge variant="outline">手動付与</Badge>
              </span>
              <span>手動でお客さまに付与するキャンペーン</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">割引内容</span>
              <span>「500円OFF」「10%OFF」のように表示</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">使用回数</span>
              <span>1人のお客さまが使える最大回数</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">キャンペーン期間</span>
              <span>開始〜終了日（未設定は「-」）</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-[160px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">有効スイッチ</span>
              <span>オン/オフで即座に有効・無効を切り替え</span>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
