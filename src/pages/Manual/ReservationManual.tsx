import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CalendarDays, CheckCircle2, AlertCircle, XCircle, 
  Search, Filter, Mail, MessageSquare 
} from 'lucide-react'

export function ReservationManual() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">予約管理マニュアル</h2>
        <p className="text-muted-foreground">
          予約の確認、ステータス変更、キャンセル対応など、予約に関する一連の業務フローを解説します。
        </p>
      </div>

      {/* ステータスフロー */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          予約ステータスと対応フロー
        </h3>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-t-4 border-t-yellow-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">1. 保留 (Pending)</CardTitle>
              <CardDescription>対応待ちの状態</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>申し込み直後の状態です。内容を確認し、問題なければ確定処理を行います。</p>
              <div className="bg-yellow-50 text-yellow-800 p-2 rounded text-xs">
                <strong>アクション:</strong> 内容確認 → 確定ボタン
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">2. 確定 (Confirmed)</CardTitle>
              <CardDescription>予約完了の状態</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>お客様に参加確定メールが送信され、スケジュール上の席が確保されています。</p>
              <div className="bg-green-50 text-green-800 p-2 rounded text-xs">
                <strong>アクション:</strong> 当日を迎えるのみ
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-red-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">3. キャンセル</CardTitle>
              <CardDescription>無効な状態</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>お客様都合または公演中止によりキャンセルされた状態です。席は解放されます。</p>
              <div className="bg-red-50 text-red-800 p-2 rounded text-xs">
                <strong>注意:</strong> 復元はできません
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* シナリオ別対応 */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          主な対応シーン
        </h3>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                貸切リクエストが届いた場合
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                貸切予約は「リクエスト（承認待ち）」として届きます。
                <br />
                1. <strong>「貸切確認」ページ</strong>で、希望日時とGMの空き状況を確認します。
                <br />
                2. 問題なければ「承認」ボタンを押します。自動的に予約が確定し、スケジュールが押さえられます。
                <br />
                3. 都合が悪い場合は、代案を提示するか「却下」を選択します。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                直前の人数変更・キャンセル
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                電話などでキャンセル連絡を受けた場合は、管理画面から手動でステータスを「キャンセル」に変更してください。
                <br />
                メモ欄に「電話にて受付（担当：〇〇）」と残しておくと、後で経緯が分かりやすくなります。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" />
                過去の予約を探す
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                「フィルター」機能を使って、特定のお客様名や電話番号、予約番号で検索できます。
                「未払い」のみを抽出して、月末の請求漏れチェックにも活用できます。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

