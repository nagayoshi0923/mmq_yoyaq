import { BookOpen, Plus, Link2, FileCheck, AlertTriangle, CheckCircle, Info } from 'lucide-react'

const ADD_METHODS = [
  {
    title: 'MMQカタログから追加',
    badge: 'おすすめ',
    badgeColor: 'bg-blue-100 text-blue-700',
    body: 'MMQに登録済みのシナリオから上演許可を得て追加します。シナリオ情報（画像・説明文・人数）は自動的に反映されます。申請→承認後に表示されるようになります。',
    steps: [
      '「シナリオ」ページの「シナリオを追加」をクリック',
      'MMQカタログから上演するシナリオを検索・選択',
      '「上演申請」を送信する',
      '作者に承認されると自分の組織のシナリオとして表示される',
    ],
  },
  {
    title: '独自シナリオとして登録',
    badge: '手動',
    badgeColor: 'bg-slate-100 text-slate-700',
    body: 'MMQカタログに未登録のシナリオを手動で登録できます。タイトル・説明文・画像・プレイ人数・時間を入力してください。',
    steps: [
      '「シナリオを追加」→「独自シナリオとして登録」を選択',
      'タイトル・説明文・人数・プレイ時間を入力',
      '画像をアップロード（任意）',
      '「保存」を押して登録完了',
    ],
  },
]

const STORE_LINK_STEPS = [
  'シナリオ一覧から対象シナリオをクリックして詳細ページを開きます',
  '「上演店舗」タブを選択します',
  '「店舗を追加」から上演可能な店舗を選択します',
  '公演スケジュールを作成する際に、この店舗でこのシナリオが選択できるようになります',
]

const REPORT_INFO = [
  {
    title: '公演報告の目的',
    body: 'シナリオ作者への公演実績報告です。実施した公演の日時・人数を記録し、送信します。多くのシナリオは定期的な報告が必要です。',
  },
  {
    title: '報告のタイミング',
    body: '月次での報告が一般的です。「売上・管理 → 公演報告」ページから、先月の実績をまとめて送信できます。',
  },
  {
    title: '報告漏れを防ぐには',
    body: '毎月同じ日（例：月末）に報告する習慣をつけると漏れが防げます。ダッシュボードに未報告件数が表示されます。',
  },
]

export function ScenarioGuideManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">シナリオ管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          上演するシナリオの登録・店舗への紐付け・公演報告の管理方法を解説します。
          シナリオを正しく設定することで、お客様が予約サイトで正確な情報を確認できるようになります。
        </p>
      </div>

      {/* シナリオの追加 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">シナリオを追加する</h3>
        </div>
        <div className="space-y-4">
          {ADD_METHODS.map(method => (
            <div key={method.title} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{method.title}</p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${method.badgeColor}`}>
                  {method.badge}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{method.body}</p>
              <ol className="space-y-1.5">
                {method.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-xs text-slate-600">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* 店舗への紐付け */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Link2 className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">店舗へ紐付ける</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          シナリオは「どの店舗で上演できるか」を設定する必要があります。紐付けをしないと、スケジュール作成時にシナリオを選択できません。
        </p>
        <div className="space-y-2">
          {STORE_LINK_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
              <span className="h-5 w-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{step}</span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            スタッフが担当できるシナリオは、「担当作品」ページで別途設定します。GMとして割り当てるには担当作品への登録が必要です。
          </p>
        </div>
      </section>

      {/* 公演報告 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <FileCheck className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">公演報告について</h3>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {REPORT_INFO.map(info => (
            <div key={info.title} className="flex gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800 mb-1">{info.title}</p>
                <p className="text-xs text-blue-700 leading-relaxed">{info.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* スタッフの担当作品 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <h3 className="text-lg font-semibold">スタッフの担当作品を設定する</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          各スタッフが担当（GM）できるシナリオを設定します。スタッフ自身が「担当作品」ページから登録するか、管理者が設定できます。
          担当作品に登録されていないシナリオのGMには割り当てられません。
        </p>
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-600">
            設定場所：<span className="font-mono bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-700">シフト・GM → 担当作品</span>
          </p>
        </div>
      </section>
    </div>
  )
}
