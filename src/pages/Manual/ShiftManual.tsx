import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Calendar, Clock, UserCheck, CalendarDays, 
  AlertTriangle, Save, FileText 
} from 'lucide-react'

export function ShiftManual() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">シフト・スケジュール管理マニュアル</h2>
        <p className="text-muted-foreground">
          毎月のシフト提出から、公演スケジュールの作成、スタッフ配置までの流れを解説します。
        </p>
      </div>

      {/* 月次フロー */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <Calendar className="h-5 w-5 text-primary" />
          毎月の作業フロー
        </h3>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-none border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                1. 提出期間の設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                「シフト提出」ページで、スタッフがシフトを入力できる期間（例: 毎月1日〜10日）と、対象の月を設定します。
              </p>
              <div className="bg-muted p-2 rounded">
                <strong>ポイント:</strong> 提出期限を過ぎると、スタッフは画面から入力できなくなります。変更が必要な場合は管理者が直接修正します。
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                2. スケジュール作成
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                「スケジュール管理」ページで、日付セルをクリックして公演枠を作成します。
                または、CSVインポート機能を使って一括登録することも可能です。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                3. スタッフ配置 (GM決定)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                作成した公演枠にGM（ゲームマスター）を割り当てます。
                シフト提出済みのスタッフは、空き状況がアイコンで表示されるので、スムーズに配置できます。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                4. 公開
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                スケジュールが固まったら、予約サイトでの受付を開始します。
                （現在は作成と同時に公開される仕様です。将来的に「下書き」機能が追加される可能性があります）
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 便利機能 */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <FileText className="h-5 w-5 text-primary" />
          便利な機能
        </h3>

        <div className="space-y-4">
          <Card className="shadow-none border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                GMロールの管理
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                1つの公演に複数のスタッフを配置できます。
                <br />
                - <strong>メインGM:</strong> 公演の進行責任者
                <br />
                - <strong>サブGM:</strong> 補助スタッフ（給与計算対象）
                <br />
                - <strong>スタッフ参加:</strong> 人数合わせなどで参加するスタッフ（給与対象外・予約リストに追加）
                <br />
                これらを使い分けることで、正確な給与計算と予約管理が可能になります。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                公演の中止と復活
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                急な事情で公演ができなくなった場合は「中止」に設定します。
                削除するのではなく「中止」ステータスにすることで、履歴を残しつつ予約受付を停止できます。
                状況が変われば「復活」させることも可能です。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}

