import { TrendingUp, BarChart2, FileText, DollarSign, Users, Info, CheckCircle } from 'lucide-react'

const TABS = [
  {
    id: 'overview',
    label: '売上概要',
    desc: '月次の売上合計・来場者数・公演数をまとめて確認できます。期間を絞り込んでの集計も可能です。',
    icon: TrendingUp,
  },
  {
    id: 'annual',
    label: '年間分析',
    desc: '月別の売上推移グラフを確認できます。前年比較や季節トレンドの把握に使います。',
    icon: BarChart2,
  },
  {
    id: 'scenario',
    label: 'シナリオ別',
    desc: 'シナリオごとの上演回数・売上・平均来場者数を比較します。人気シナリオの把握に役立ちます。',
    icon: FileText,
  },
  {
    id: 'staff',
    label: 'スタッフ報酬',
    desc: 'スタッフ別の公演担当回数と報酬額を集計します。給与計算の基礎データとして使用できます。',
    icon: Users,
  },
  {
    id: 'misc',
    label: '雑収支管理',
    desc: '通常予約以外の収入・支出を手動で入力できます。グッズ販売・備品費などの記録に使います。',
    icon: DollarSign,
  },
]

const SALARY_TIPS = [
  {
    title: '報酬レートの設定',
    body: '「設定 → スタッフ → 報酬」ページで、公演1本あたりの報酬レートを設定します。シナリオの種類や時間帯によって異なるレートも設定できます。',
  },
  {
    title: '月次の給与計算手順',
    body: '「売上・管理 → 公演報告」→「スタッフ報酬」タブから対象月を選択すると、スタッフごとの担当回数と報酬額が自動集計されます。',
  },
  {
    title: 'CSVエクスポート',
    body: '集計データはCSVでダウンロードできます。給与計算ソフトや会計ツールに取り込んでご利用ください。',
  },
]

export function SalesGuideManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">売上・レポート</h2>
        <p className="text-muted-foreground leading-relaxed">
          公演の売上・来場者数・スタッフ報酬などを分析するページです。
          月次のまとめや年間トレンドの把握、給与計算まで、運営に必要な数字を一か所で確認できます。
        </p>
      </div>

      {/* 各タブの説明 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">売上ページの各タブ</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          「売上・管理 → 売上」ページには複数のタブがあります。目的に応じて使い分けてください。
        </p>
        <div className="space-y-2">
          {TABS.map(tab => (
            <div key={tab.id} className="flex gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50/50">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <tab.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold mb-0.5">
                  {tab.label}
                  <span className="text-xs text-slate-400 font-normal ml-2 font-mono">?tab={tab.id}</span>
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{tab.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 給与計算 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">スタッフ報酬・給与計算</h3>
        </div>
        <div className="space-y-3">
          {SALARY_TIPS.map((tip, i) => (
            <div key={i} className="flex gap-3 p-4 rounded-lg border border-green-200 bg-green-50">
              <span className="h-6 w-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-green-800 mb-1">{tip.title}</p>
                <p className="text-xs text-green-700 leading-relaxed">{tip.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 外部売上・フランチャイズ */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" />
          <h3 className="text-lg font-semibold">外部売上・フランチャイズについて</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          他の予約プラットフォームや外部チャネルからの売上は「外部売上」タブで管理できます。
          フランチャイズ（複数組織をまたいだ管理）が必要な場合は、「MMQ運営」権限が付いたアカウントでログインしてください。
        </p>
        <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <span className="text-xs text-blue-700">外部売上の入力は「売上 → 外部売上」タブから手動で行います</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <span className="text-xs text-blue-700">集計画面では、外部売上と通常売上を合算して表示できます</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
            <span className="text-xs text-blue-700">公演報告（ライセンス報告）は作者への実績報告です。売上集計とは別に管理されます</span>
          </div>
        </div>
      </section>
    </div>
  )
}
