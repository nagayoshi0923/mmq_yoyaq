import { 
  CheckCircle2, AlertCircle, 
  Search, Mail, MessageSquare, Clock, XCircle
} from 'lucide-react'

export function ReservationManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">予約管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          予約の確認、ステータス変更、キャンセル対応など、予約に関する一連の業務フローを解説します。
        </p>
      </div>

      {/* ステータスフロー */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">予約ステータスと対応フロー</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 保留 */}
          <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">STEP 1</span>
            </div>
            <h4 className="font-medium text-yellow-900 dark:text-yellow-100">保留 (Pending)</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">対応待ちの状態</p>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p>申し込み直後の状態です。内容を確認し、問題なければ確定処理を行います。</p>
            </div>
            <div className="bg-white dark:bg-yellow-900/50 rounded p-2 text-xs text-yellow-700 dark:text-yellow-300">
                <strong>アクション:</strong> 内容確認 → 確定ボタン
              </div>
          </div>

          {/* 確定 */}
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">STEP 2</span>
            </div>
            <h4 className="font-medium text-green-900 dark:text-green-100">確定 (Confirmed)</h4>
            <p className="text-sm text-green-700 dark:text-green-300">予約完了の状態</p>
            <div className="text-sm text-green-800 dark:text-green-200">
              <p>お客様に参加確定メールが送信され、スケジュール上の席が確保されています。</p>
            </div>
            <div className="bg-white dark:bg-green-900/50 rounded p-2 text-xs text-green-700 dark:text-green-300">
                <strong>アクション:</strong> 当日を迎えるのみ
              </div>
          </div>

          {/* キャンセル */}
          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">STEP 3</span>
            </div>
            <h4 className="font-medium text-red-900 dark:text-red-100">キャンセル</h4>
            <p className="text-sm text-red-700 dark:text-red-300">無効な状態</p>
            <div className="text-sm text-red-800 dark:text-red-200">
              <p>お客様都合または公演中止によりキャンセルされた状態です。席は解放されます。</p>
            </div>
            <div className="bg-white dark:bg-red-900/50 rounded p-2 text-xs text-red-700 dark:text-red-300">
                <strong>注意:</strong> 復元はできません
              </div>
          </div>
        </div>
      </section>

      {/* シナリオ別対応 */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">主な対応シーン</h3>
        </div>

        <div className="space-y-3">
          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">貸切リクエストが届いた場合</h4>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>貸切予約は「リクエスト（承認待ち）」として届きます。</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li><strong>「貸切確認」ページ</strong>で、希望日時とGMの空き状況を確認します。</li>
                <li>問題なければ「承認」ボタンを押します。自動的に予約が確定し、スケジュールが押さえられます。</li>
                <li>都合が悪い場合は、代案を提示するか「却下」を選択します。</li>
              </ol>
            </div>
          </div>

          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">直前の人数変更・キャンセル</h4>
            </div>
            <p className="text-sm text-muted-foreground">
                電話などでキャンセル連絡を受けた場合は、管理画面から手動でステータスを「キャンセル」に変更してください。
                メモ欄に「電話にて受付（担当：〇〇）」と残しておくと、後で経緯が分かりやすくなります。
              </p>
          </div>

          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">過去の予約を探す</h4>
            </div>
            <p className="text-sm text-muted-foreground">
                「フィルター」機能を使って、特定のお客様名や電話番号、予約番号で検索できます。
                「未払い」のみを抽出して、月末の請求漏れチェックにも活用できます。
              </p>
          </div>
        </div>
      </section>
    </div>
  )
}
