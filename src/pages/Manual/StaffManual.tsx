import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  UserPlus, UserMinus, RefreshCw, ShieldCheck, 
  Users, Briefcase, AlertTriangle, MessageSquare
} from 'lucide-react'

export function StaffManual() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* 概要 */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">スタッフ・アカウント管理マニュアル</h2>
        <p className="text-muted-foreground">
          スタッフの採用から退職、再雇用まで、アカウントのライフサイクルに応じた適切な操作方法とシステムの挙動を解説します。
        </p>
      </div>

      {/* 基本的なライフサイクル */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <RefreshCw className="h-5 w-5 text-primary" />
          基本ライフサイクル
        </h3>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 1. 採用・招待 */}
          <Card className="border-l-4 border-l-blue-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5 text-blue-500" />
                1. 採用・招待 (Onboarding)
              </CardTitle>
              <CardDescription>新しいスタッフを迎え入れる時</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>シーン:</strong> 新しいスタッフ「田中さん」を採用しました。
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>操作:</strong> 「新規スタッフ」ボタンから名前とメールアドレスを入力し、「招待する」を選択します。</li>
                <li><strong>結果:</strong> 田中さんに招待メールが届きます。ログインすると「スタッフ権限」が付与された状態でスタートします。</li>
              </ul>
            </CardContent>
          </Card>

          {/* 2. 退職・削除 */}
          <Card className="border-l-4 border-l-red-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserMinus className="h-5 w-5 text-red-500" />
                2. 退職・削除 (Offboarding)
              </CardTitle>
              <CardDescription>スタッフが辞める時</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>シーン:</strong> 田中さんが退職することになりました。
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>操作:</strong> スタッフ一覧から「削除」を実行します。</li>
                <li><strong>結果:</strong> スタッフ名簿からは消えますが、<strong>アカウントは消えません</strong>。権限が「一般顧客」に戻ります。</li>
                <li><strong>重要:</strong> 管理画面には入れなくなりますが、個人的な予約履歴などは残ります。</li>
              </ul>
            </CardContent>
          </Card>

          {/* 3. 復帰・再雇用 */}
          <Card className="border-l-4 border-l-green-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5 text-green-500" />
                3. 復帰・再雇用 (Re-hiring)
              </CardTitle>
              <CardDescription>辞めたスタッフが戻ってきた時</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>シーン:</strong> 半年後、田中さんが「また働きたい」と戻ってきました。
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>操作:</strong> 「新規スタッフ」で<strong>同じメールアドレス</strong>を入力して招待します。</li>
                <li><strong>結果:</strong> 既存のアカウントが再利用され、権限が再び「スタッフ」に昇格します。以前のアカウントでそのまま業務を再開できます。</li>
              </ul>
            </CardContent>
          </Card>

          {/* 4. 管理者の保護 */}
          <Card className="border-l-4 border-l-yellow-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-yellow-500" />
                4. 安全装置 (Safety)
              </CardTitle>
              <CardDescription>管理者が自分を削除してしまった時</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>シーン:</strong> あなた（管理者）が誤って自分のスタッフデータを削除しました。
              </div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>結果:</strong> スタッフデータは消えますが、<strong>管理者権限（admin）は維持されます</strong>。</li>
                <li><strong>安心:</strong> システムから閉め出されることはありません。再度自分を登録し直せば元通りです。</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 応用シナリオ */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <Briefcase className="h-5 w-5 text-primary" />
          応用シナリオ
        </h3>

        <div className="space-y-4">
          <Card className="shadow-none border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                スタッフがプライベートで遊びに来る場合
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                スタッフアカウントのまま予約サイトから予約可能です。
                システムは「スタッフ」と認識しつつ「顧客」として予約を受け付けます。
                予約リストには「田中（スタッフ）」のように表示され、履歴は顧客データとして蓄積されます。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                常連さんをスタッフとしてスカウトする場合
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                既に顧客アカウントを持っている方のメールアドレスで「招待」を行ってください。
                これまでの予約履歴やアカウント情報を引き継いだまま、スタッフ権限が付与されます。
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-none border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                紐付けミスを修正する場合
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                間違ったアカウントを紐付けてしまった場合は、「連携解除」を行ってください。
                誤って紐付けられたユーザーは即座に「一般顧客」に戻り、実害を防げます。
                その後、正しいメールアドレスで再度招待を行ってください。
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Discord連携設定 */}
      <section className="space-y-6">
        <h3 className="text-xl font-semibold flex items-center gap-2 border-b pb-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Discord連携設定
        </h3>

        <p className="text-muted-foreground">
          Discord通知機能を使用するには、各スタッフのDiscord IDとチャンネルIDの設定が必要です。
          これにより、貸切予約のGM確認通知やシフトリマインダーが届くようになります。
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Discord ID */}
          <Card className="border-l-4 border-l-indigo-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-indigo-500" />
                Discord ID
              </CardTitle>
              <CardDescription>ユーザーを特定・メンションするためのID</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>用途:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>シフト未提出リマインダーでのメンション</li>
                  <li>貸切予約でGMがボタンを押した時の回答者特定</li>
                </ul>
              </div>
              <div>
                <strong className="block mb-2">取得方法:</strong>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Discordの設定 → 詳細設定 → 「開発者モード」をON</li>
                  <li>該当ユーザーのアイコンを右クリック</li>
                  <li>「ユーザーIDをコピー」を選択</li>
                </ol>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md text-blue-700 dark:text-blue-300">
                <strong>例:</strong> 1234567890123456789
              </div>
            </CardContent>
          </Card>

          {/* Discord チャンネルID */}
          <Card className="border-l-4 border-l-purple-500 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5 text-purple-500" />
                Discord チャンネルID
              </CardTitle>
              <CardDescription>通知を送信するチャンネル</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded-md">
                <strong>用途:</strong>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>貸切予約のGM確認通知（ボタン付き）</li>
                  <li>個人用の通知チャンネルとして使用</li>
                </ul>
              </div>
              <div>
                <strong className="block mb-2">取得方法:</strong>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Discordの設定 → 詳細設定 → 「開発者モード」をON</li>
                  <li>通知を送りたいチャンネルを右クリック</li>
                  <li>「チャンネルIDをコピー」を選択</li>
                </ol>
              </div>
              <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-md text-purple-700 dark:text-purple-300">
                <strong>例:</strong> 9876543210987654321
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 通知の種類 */}
        <Card className="shadow-none border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Discord通知の種類</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">通知タイプ</th>
                    <th className="py-2 pr-4 font-medium">送信先</th>
                    <th className="py-2 font-medium">必要な設定</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="py-2 pr-4">貸切予約GM確認</td>
                    <td className="py-2 pr-4">各GMの個人チャンネル</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs">discord_channel_id</Badge>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 pr-4">シフト提出完了</td>
                    <td className="py-2 pr-4">全体通知チャンネル</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs">管理者設定</Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">シフト未提出リマインダー</td>
                    <td className="py-2 pr-4">全体通知チャンネル + メンション</td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs">discord_id</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 注意事項 */}
        <Card className="shadow-none border border-yellow-200 bg-yellow-50/50 dark:bg-yellow-950/20 dark:border-yellow-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              注意事項
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-700 dark:text-yellow-400 space-y-2">
            <p>
              • Discord IDとチャンネルIDが設定されていないスタッフには、対応する通知が届きません。
            </p>
            <p>
              • 貸切予約のGM確認通知を受け取るには、そのシナリオの「担当GM」として設定されている必要があります。
            </p>
            <p>
              • Botがチャンネルにメッセージを送信する権限を持っていることを確認してください。
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

