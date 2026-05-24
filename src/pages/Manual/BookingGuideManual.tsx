import { ClipboardCheck, Ticket, Users, CheckCircle, XCircle, Clock, AlertTriangle, MessageSquare } from 'lucide-react'

const PRIVATE_BOOKING_FLOW = [
  {
    status: 'リクエスト受付',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-800',
    body: 'お客様が貸切リクエストを送ると、「貸切管理」ページに「承認待ち」として届きます。管理者・スタッフ両方に通知が届きます。',
  },
  {
    status: '内容を確認する',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
    body: '希望日時・シナリオ・人数・GM空き状況を確認します。日程が重複していないかスケジュール画面でも確認しましょう。',
  },
  {
    status: '承認または却下',
    color: 'bg-green-50 border-green-200 text-green-700',
    badge: 'bg-green-100 text-green-800',
    body: '問題なければ「承認」を押します。スケジュールに自動反映され、確定メールがお客様に送信されます。都合が悪い場合は「却下」し、代案をチャットで連絡しましょう。',
  },
  {
    status: 'GMを割り当てる',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    badge: 'bg-purple-100 text-purple-800',
    body: '承認後、スケジュール画面または貸切詳細ページからGMを割り当てます。GMが決まったらスタッフへの共有も忘れずに。',
  },
]

const RESERVATION_TIPS = [
  {
    title: '通常予約のステータス管理',
    body: '「予約管理」ページでは通常の公演予約を管理します。申し込み直後は「保留」状態のため、内容確認後に「確定」に変更してください。確定するとお客様に確定メールが届きます。',
    icon: Ticket,
    color: 'border-slate-200 bg-slate-50',
  },
  {
    title: 'チャット機能の活用',
    body: '貸切リクエストにはお客様との1対1チャット機能があります。日程調整や特別なリクエストへの対応はチャットで行うと記録が残り便利です。',
    icon: MessageSquare,
    color: 'border-green-200 bg-green-50',
  },
  {
    title: 'グループ管理について',
    body: '貸切を申し込んだグループには招待コードが発行されます。グループメンバーはコードを使ってグループに参加し、候補日を投票できます。「グループ一覧」でグループ全体の状況を確認できます。',
    icon: Users,
    color: 'border-blue-200 bg-blue-50',
  },
]

const CAUTIONS = [
  '承認後のキャンセルはお客様への連絡が必要です。ステータスを変更する前に必ず連絡しましょう。',
  '貸切グループの削除は復元できません。依頼があった場合は、お客様の意思を必ず確認してから実行してください。',
  '「未払い」フィルターを使うと月末の請求漏れを確認できます。定期的にチェックすることをおすすめします。',
]

export function BookingGuideManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">貸切・予約管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          通常予約と貸切予約の管理方法を解説します。貸切予約はリクエスト形式で届くため、内容確認・承認・GM割り当てまでの流れをしっかり把握しておきましょう。
        </p>
      </div>

      {/* 貸切予約の流れ */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">貸切予約の対応フロー</h3>
        </div>
        <div className="space-y-3">
          {PRIVATE_BOOKING_FLOW.map((f, i) => (
            <div key={i} className={`rounded-lg border p-4 ${f.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="h-5 w-5 rounded-full bg-white/80 flex items-center justify-center text-xs font-bold text-slate-600">
                  {i + 1}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${f.badge}`}>{f.status}</span>
              </div>
              <p className="text-xs leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 各機能の説明 */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Ticket className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">各機能の使い方</h3>
        </div>
        <div className="space-y-3">
          {RESERVATION_TIPS.map(tip => (
            <div key={tip.title} className={`rounded-lg border p-4 ${tip.color}`}>
              <div className="flex items-center gap-2 mb-2">
                <tip.icon className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-800">{tip.title}</p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 注意事項 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h3 className="text-lg font-semibold">注意事項</h3>
        </div>
        <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
          {CAUTIONS.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <XCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <span className="text-xs text-amber-700 leading-relaxed">{c}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ステータス早見表 */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <h3 className="text-lg font-semibold">予約ステータス早見表</h3>
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold">
              <tr>
                <th className="text-left px-4 py-2">ステータス</th>
                <th className="text-left px-4 py-2">意味</th>
                <th className="text-left px-4 py-2">次のアクション</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2"><span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">保留</span></td>
                <td className="px-4 py-2 text-slate-600">申し込み受付済み、確認待ち</td>
                <td className="px-4 py-2 text-slate-600">内容確認 → 確定ボタン</td>
              </tr>
              <tr>
                <td className="px-4 py-2"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">確定</span></td>
                <td className="px-4 py-2 text-slate-600">予約完了、席確保済み</td>
                <td className="px-4 py-2 text-slate-600">当日チェックインを待つ</td>
              </tr>
              <tr>
                <td className="px-4 py-2"><span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">チェックイン済</span></td>
                <td className="px-4 py-2 text-slate-600">来店確認済み</td>
                <td className="px-4 py-2 text-slate-600">対応完了</td>
              </tr>
              <tr>
                <td className="px-4 py-2"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">キャンセル</span></td>
                <td className="px-4 py-2 text-slate-600">無効（復元不可）</td>
                <td className="px-4 py-2 text-slate-600">―</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
