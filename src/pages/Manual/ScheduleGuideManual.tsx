import { CalendarDays, UserCheck, Clock, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react'

const ADD_STEPS = [
  '左サイドバーの「スケジュール」をクリックします',
  '右上の「＋ 公演を追加」ボタンをクリックします',
  '日付・開始時刻・終了時刻を選択します',
  '店舗・シナリオ・定員を設定します',
  '「保存」を押すとスケジュールに追加されます',
]

const GM_STEPS = [
  'スケジュール画面の公演をクリックして詳細ダイアログを開きます',
  '「GM」欄のドロップダウンから担当スタッフを選択します',
  '複数GMが必要な場合は、サブGMも設定できます',
  '変更は即時保存されます',
]

const SHIFT_FLOW = [
  { actor: 'スタッフ', action: '「シフト提出」ページから翌月の希望日を選択して提出します' },
  { actor: '管理者', action: '提出されたシフトを「シフト・GM」ページで一覧確認します' },
  { actor: '管理者', action: 'スケジュールにGMを割り当て、確定させます' },
  { actor: 'スタッフ', action: '「GM確認」ページで担当公演を確認できます' },
]

const TIPS = [
  {
    label: '繰り返し公演の設定',
    body: '毎週同じ曜日に公演がある場合は、公演追加時に「繰り返し」を選択すると、まとめて登録できます。',
    type: 'info',
  },
  {
    label: 'GMが未設定のまま公演日を迎えないように',
    body: 'スケジュール画面でGM未設定の公演は赤くハイライトされます。公演1週間前までにGMを確定させましょう。',
    type: 'warning',
  },
  {
    label: '貸切予約を承認するとスケジュールに自動反映',
    body: '「貸切管理」で承認した貸切予約は、スケジュールに自動的に追加されます。手動で入力し直す必要はありません。',
    type: 'info',
  },
]

export function ScheduleGuideManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">スケジュール管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          公演日程の登録・GMの割り当て・シフト管理を行うページです。
          スケジュールは月ごとのカレンダー形式で表示され、各公演の状況をひと目で把握できます。
        </p>
      </div>

      {/* 公演の追加 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">公演を追加する</h3>
        </div>
        <div className="space-y-2">
          {ADD_STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
              <span className="h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700">{step}</span>
            </div>
          ))}
        </div>
      </section>

      {/* GMの割り当て */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <UserCheck className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">GMを割り当てる</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          各公演にGM（ゲームマスター）を割り当てます。担当作品に登録されているシナリオを持つスタッフのみ選択できます。
        </p>
        <div className="space-y-2">
          {GM_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <ChevronRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-slate-700">{step}</span>
            </div>
          ))}
        </div>
      </section>

      {/* シフト管理フロー */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">シフト管理の流れ</h3>
        </div>
        <div className="space-y-0">
          {SHIFT_FLOW.map((f, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  f.actor === '管理者' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {i + 1}
                </div>
                {i < SHIFT_FLOW.length - 1 && <div className="w-0.5 h-6 bg-slate-200" />}
              </div>
              <div className="pb-3 flex-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mr-2 ${
                  f.actor === '管理者' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {f.actor}
                </span>
                <span className="text-sm text-slate-700">{f.action}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ヒント */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <h3 className="text-lg font-semibold">運用のポイント</h3>
        </div>
        <div className="space-y-2">
          {TIPS.map(tip => (
            <div
              key={tip.label}
              className={`p-4 rounded-lg border ${
                tip.type === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-blue-200 bg-blue-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {tip.type === 'warning'
                  ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  : <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
                }
                <p className={`text-sm font-semibold ${tip.type === 'warning' ? 'text-amber-800' : 'text-blue-800'}`}>
                  {tip.label}
                </p>
              </div>
              <p className={`text-xs leading-relaxed ${tip.type === 'warning' ? 'text-amber-700' : 'text-blue-700'}`}>
                {tip.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
