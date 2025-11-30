import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  UserPlus, UserMinus, RefreshCw, ShieldCheck, 
  Users, Mail, Briefcase, AlertTriangle 
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
          <Card className="border-l-4 border-l-blue-500">
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
          <Card className="border-l-4 border-l-red-500">
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
          <Card className="border-l-4 border-l-green-500">
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
          <Card className="border-l-4 border-l-yellow-500">
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
          <Card>
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

          <Card>
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

          <Card>
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
    </div>
  )
}

