import { Badge } from '@/components/ui/badge'
import { 
  UserPlus, UserMinus, RefreshCw, ShieldCheck, 
  Users, Briefcase, AlertTriangle, MessageSquare
} from 'lucide-react'

export function StaffManual() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      {/* 概要 */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">スタッフ・アカウント管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          スタッフの採用から退職、再雇用まで、アカウントのライフサイクルに応じた適切な操作方法とシステムの挙動を解説します。
        </p>
      </div>

      {/* 基本的なライフサイクル */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">基本ライフサイクル</h3>
        </div>

        <div className="space-y-4">
          {/* 1. 採用・招待 */}
          <div className="bg-muted/30 rounded-lg p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">1</span>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-blue-500" />
                  <h4 className="font-medium">採用・招待 (Onboarding)</h4>
                </div>
                <p className="text-sm text-muted-foreground">新しいスタッフを迎え入れる時</p>
                <div className="bg-background rounded-md p-3 text-sm space-y-2">
                  <p><strong>シーン:</strong> 新しいスタッフ「田中さん」を採用しました。</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>「新規スタッフ」ボタンから名前とメールアドレスを入力し、「招待する」を選択します。</li>
                    <li>田中さんに招待メールが届きます。ログインすると「スタッフ権限」が付与された状態でスタートします。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 退職・削除 */}
          <div className="bg-muted/30 rounded-lg p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">2</span>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <UserMinus className="h-4 w-4 text-red-500" />
                  <h4 className="font-medium">退職・削除 (Offboarding)</h4>
                </div>
                <p className="text-sm text-muted-foreground">スタッフが辞める時</p>
                <div className="bg-background rounded-md p-3 text-sm space-y-2">
                  <p><strong>シーン:</strong> 田中さんが退職することになりました。</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>スタッフ一覧から「削除」を実行します。</li>
                    <li>スタッフ名簿からは消えますが、<strong>アカウントは消えません</strong>。権限が「一般顧客」に戻ります。</li>
                    <li>管理画面には入れなくなりますが、個人的な予約履歴などは残ります。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 復帰・再雇用 */}
          <div className="bg-muted/30 rounded-lg p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">3</span>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-green-500" />
                  <h4 className="font-medium">復帰・再雇用 (Re-hiring)</h4>
                </div>
                <p className="text-sm text-muted-foreground">辞めたスタッフが戻ってきた時</p>
                <div className="bg-background rounded-md p-3 text-sm space-y-2">
                  <p><strong>シーン:</strong> 半年後、田中さんが「また働きたい」と戻ってきました。</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>「新規スタッフ」で<strong>同じメールアドレス</strong>を入力して招待します。</li>
                    <li>既存のアカウントが再利用され、権限が再び「スタッフ」に昇格します。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 4. 安全装置 */}
          <div className="bg-muted/30 rounded-lg p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 h-6 w-6 rounded-full bg-yellow-500 text-white text-xs font-bold flex items-center justify-center">4</span>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-yellow-500" />
                  <h4 className="font-medium">安全装置 (Safety)</h4>
                </div>
                <p className="text-sm text-muted-foreground">管理者が自分を削除してしまった時</p>
                <div className="bg-background rounded-md p-3 text-sm space-y-2">
                  <p><strong>シーン:</strong> あなた（管理者）が誤って自分のスタッフデータを削除しました。</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    <li>スタッフデータは消えますが、<strong>管理者権限（admin）は維持されます</strong>。</li>
                    <li>システムから閉め出されることはありません。再度自分を登録し直せば元通りです。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 応用シナリオ */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">応用シナリオ</h3>
        </div>

        <div className="space-y-3">
          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">スタッフがプライベートで遊びに来る場合</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              スタッフアカウントのまま予約サイトから予約可能です。
              システムは「スタッフ」と認識しつつ「顧客」として予約を受け付けます。
            </p>
          </div>

          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">常連さんをスタッフとしてスカウトする場合</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              既に顧客アカウントを持っている方のメールアドレスで「招待」を行ってください。
              これまでの予約履歴やアカウント情報を引き継いだまま、スタッフ権限が付与されます。
            </p>
          </div>

          <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <h4 className="font-medium text-sm">紐付けミスを修正する場合</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              間違ったアカウントを紐付けてしまった場合は、「連携解除」を行ってください。
              誤って紐付けられたユーザーは即座に「一般顧客」に戻り、その後正しいメールアドレスで再度招待を行ってください。
            </p>
          </div>
        </div>
      </section>

      {/* Discord連携設定 */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Discord連携設定</h3>
        </div>

        <p className="text-muted-foreground text-sm">
          Discord通知機能を使用するには、各スタッフのDiscord IDとチャンネルIDの設定が必要です。
          これにより、貸切予約のGM確認通知やシフトリマインダーが届くようになります。
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Discord ID */}
          <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-medium text-indigo-900 dark:text-indigo-100">Discord ID</h4>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">用途</p>
                <ul className="list-disc pl-5 text-indigo-700 dark:text-indigo-300 space-y-1">
                  <li>シフト未提出リマインダーでのメンション</li>
                  <li>貸切予約でGMがボタンを押した時の回答者特定</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">取得方法</p>
                <ol className="list-decimal pl-5 text-indigo-700 dark:text-indigo-300 space-y-1">
                  <li>Discordの設定 → 詳細設定 → 「開発者モード」をON</li>
                  <li>該当ユーザーのアイコンを右クリック</li>
                  <li>「ユーザーIDをコピー」を選択</li>
                </ol>
              </div>
              <div className="bg-white dark:bg-indigo-900/50 rounded p-2 font-mono text-xs text-indigo-600 dark:text-indigo-300">
                例: 1234567890123456789
              </div>
            </div>
          </div>

          {/* Discord チャンネルID */}
          <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <h4 className="font-medium text-purple-900 dark:text-purple-100">Discord チャンネルID</h4>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-purple-800 dark:text-purple-200 mb-1">用途</p>
                <ul className="list-disc pl-5 text-purple-700 dark:text-purple-300 space-y-1">
                  <li>貸切予約のGM確認通知（ボタン付き）</li>
                  <li>個人用の通知チャンネルとして使用</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-purple-800 dark:text-purple-200 mb-1">取得方法</p>
                <ol className="list-decimal pl-5 text-purple-700 dark:text-purple-300 space-y-1">
                  <li>Discordの設定 → 詳細設定 → 「開発者モード」をON</li>
                  <li>通知を送りたいチャンネルを右クリック</li>
                  <li>「チャンネルIDをコピー」を選択</li>
                </ol>
              </div>
              <div className="bg-white dark:bg-purple-900/50 rounded p-2 font-mono text-xs text-purple-600 dark:text-purple-300">
                例: 9876543210987654321
              </div>
            </div>
          </div>
        </div>

        {/* 通知の種類 */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b">
            <h4 className="font-medium text-sm">Discord通知の種類</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left py-3 px-4 font-medium">通知タイプ</th>
                  <th className="text-left py-3 px-4 font-medium">送信先</th>
                  <th className="text-left py-3 px-4 font-medium">必要な設定</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-3 px-4">貸切予約GM確認</td>
                  <td className="py-3 px-4">各GMの個人チャンネル</td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="text-xs font-normal">discord_channel_id</Badge>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4">シフト提出完了</td>
                  <td className="py-3 px-4">全体通知チャンネル</td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="text-xs font-normal">管理者設定</Badge>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4">シフト未提出リマインダー</td>
                  <td className="py-3 px-4">全体通知チャンネル + メンション</td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="text-xs font-normal">discord_id</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 注意事項 */}
        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">注意事項</p>
              <ul className="list-disc pl-5 space-y-1 text-yellow-700 dark:text-yellow-300">
                <li>Discord IDとチャンネルIDが設定されていないスタッフには、対応する通知が届きません。</li>
                <li>貸切予約のGM確認通知を受け取るには、そのシナリオの「担当GM」として設定されている必要があります。</li>
                <li>Botがチャンネルにメッセージを送信する権限を持っていることを確認してください。</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
