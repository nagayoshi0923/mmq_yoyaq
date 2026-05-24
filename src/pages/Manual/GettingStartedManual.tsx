import { CheckCircle, ArrowRight, Building2, Users, BookOpen, CalendarDays, Settings, AlertTriangle } from 'lucide-react'

const SETUP_STEPS = [
  {
    step: 1,
    icon: Settings,
    title: '組織情報を設定する',
    path: '設定 → 組織 → 組織情報',
    items: [
      '組織名・ロゴ・説明文を入力します',
      'お客様に表示される情報なので、正式名称で登録しましょう',
      'SNSリンクや連絡先も設定できます',
    ],
  },
  {
    step: 2,
    icon: Building2,
    title: '店舗を登録する',
    path: '左サイドバー → 店舗',
    items: [
      '「新しい店舗を追加」ボタンから店舗を作成します',
      '店舗名・住所・定員・営業時間を設定します',
      '複数店舗がある場合は、それぞれ登録してください',
    ],
  },
  {
    step: 3,
    icon: BookOpen,
    title: 'シナリオを登録する',
    path: '左サイドバー → シナリオ',
    items: [
      '上演するシナリオを一覧から追加、またはMMQに申請します',
      '各シナリオに「上演可能店舗」と「プレイ時間」を設定します',
      '画像・説明文はお客様の予約時に表示されます',
    ],
  },
  {
    step: 4,
    icon: CalendarDays,
    title: 'スケジュールを設定する',
    path: '左サイドバー → スケジュール',
    items: [
      '「公演を追加」から日時・店舗・シナリオを選択して公演を作成します',
      'GMが決まっている場合は、この時点でGMも割り当てます',
      '定期公演は繰り返し設定を使うと効率的です',
    ],
  },
  {
    step: 5,
    icon: Users,
    title: 'スタッフを招待する',
    path: '左サイドバー → スタッフ',
    items: [
      '「新規スタッフ」ボタンから名前とメールアドレスを入力します',
      '「招待する」を選択すると、スタッフに招待メールが届きます',
      'スタッフは招待メールのリンクからパスワードを設定してログインします',
    ],
  },
  {
    step: 6,
    icon: Settings,
    title: '予約設定を確認する',
    path: '設定 → 店舗・予約',
    items: [
      '予約受付の開始・締切タイミングを設定します',
      'キャンセルポリシー・注意事項を入力します',
      '設定完了後、予約サイトで実際に確認してみましょう',
    ],
  },
]

const TIPS = [
  {
    title: 'まず「テスト予約」を試してみましょう',
    body: '自分のアカウントで予約サイトからテスト予約を入れると、お客様の視点でフローを確認できます。確認後はキャンセルしてください。',
  },
  {
    title: '設定変更は即時反映されます',
    body: '営業時間や定員などの設定変更は即座に予約サイトに反映されます。公演直前の変更には注意してください。',
  },
  {
    title: 'スタッフへの周知を忘れずに',
    body: 'スタッフ招待後、このマニュアルのURLを共有しておくとスムーズです。「マニュアル → 共通マニュアル → 受付・チェックイン」が最初の読み物としておすすめです。',
  },
]

export function GettingStartedManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">はじめ方ガイド</h2>
        <p className="text-muted-foreground leading-relaxed">
          新しく管理ツールを使い始める方向けの初期設定ガイドです。
          以下の手順を順番に進めると、最短でお客様への予約受付を開始できます。
        </p>
      </div>

      {/* セットアップ手順 */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold">初期設定の手順</h3>
        <div className="space-y-3">
          {SETUP_STEPS.map((s, i) => (
            <div key={s.step} className="flex gap-4">
              {/* ステップ番号と縦線 */}
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {s.step}
                </div>
                {i < SETUP_STEPS.length - 1 && (
                  <div className="w-0.5 flex-1 bg-slate-200 my-1" />
                )}
              </div>
              {/* コンテンツ */}
              <div className={`pb-4 flex-1 ${i < SETUP_STEPS.length - 1 ? 'mb-0' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">{s.title}</p>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono bg-slate-100 px-2 py-0.5 rounded">{s.path}</span>
                </div>
                <ul className="space-y-1">
                  {s.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-slate-600">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ヒント */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-lg font-semibold">はじめる前のヒント</h3>
        </div>
        <div className="space-y-3">
          {TIPS.map(tip => (
            <div key={tip.title} className="p-4 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-sm font-semibold text-amber-800 mb-1">{tip.title}</p>
              <p className="text-xs text-amber-700 leading-relaxed">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
