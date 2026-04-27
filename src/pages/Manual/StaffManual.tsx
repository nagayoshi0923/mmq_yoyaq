import { Badge } from '@/components/ui/badge'
import {
  UserPlus, UserMinus, RefreshCw, ShieldCheck,
  Users, Briefcase, AlertTriangle, MessageSquare, Mail, ExternalLink, KeyRound
} from 'lucide-react'
import type { HardcodedPageContent } from '@/types/hardcodedContent'

export const STAFF_DEFAULT: HardcodedPageContent = {
  description: "スタッフの採用から退職、再雇用まで、アカウントのライフサイクルに応じた適切な操作方法とシステムの挙動を解説します。",
  sections: [
    {
      heading: "基本ライフサイクル",
      items: [
        { title: "採用・招待 (Onboarding)", subtitle: "新しいスタッフを迎え入れる時", scene: "シーン: 新しいスタッフ「田中さん」を採用しました。", bullets: ["「新規スタッフ」ボタンから名前とメールアドレスを入力し、「招待する」を選択します。", "田中さんに招待メールが届きます。ログインすると「スタッフ権限」が付与された状態でスタートします。"] },
        { title: "退職・削除 (Offboarding)", subtitle: "スタッフが辞める時", scene: "シーン: 田中さんが退職することになりました。", bullets: ["スタッフ一覧から「削除」を実行します。", "スタッフ名簿からは消えますが、アカウントは消えません。権限が「一般顧客」に戻ります。", "管理画面には入れなくなりますが、個人的な予約履歴などは残ります。"] },
        { title: "復帰・再雇用 (Re-hiring)", subtitle: "辞めたスタッフが戻ってきた時", scene: "シーン: 半年後、田中さんが「また働きたい」と戻ってきました。", bullets: ["「新規スタッフ」で同じメールアドレスを入力して招待します。", "既存のアカウントが再利用され、権限が再び「スタッフ」に昇格します。"] },
        { title: "安全装置 (Safety)", subtitle: "管理者が自分を削除してしまった時", scene: "シーン: あなた（管理者）が誤って自分のスタッフデータを削除しました。", bullets: ["スタッフデータは消えますが、管理者権限（admin）は維持されます。", "システムから閉め出されることはありません。再度自分を登録し直せば元通りです。"] },
      ]
    },
    {
      heading: "招待メール送信後の流れ",
      intro: "「スタッフを招待」ボタンから招待を行うと、指定したメールアドレスに招待メールが送信されます。以下はスタッフ側とシステム側の動作フローです。",
      items: [
        { title: "招待メールを受信", body: "スタッフのメールボックスに招待メールが届きます。", note: "※ 既存アカウントの場合は「スタッフアカウント登録完了」というメールになります。" },
        { title: "パスワードを設定", body: "メール内のボタンをクリックすると、パスワード設定画面に移動します。", bullets: ["新しいパスワードを2回入力して「設定」をクリック", "設定完了後、自動的にログイン状態になります"], note: "⚠️ リンクには有効期限があります。期限切れの場合は管理者に再招待を依頼してください。", noteType: "warning" },
        { title: "スタッフとしてログイン完了", body: "パスワード設定が完了すると、スタッフ権限でシステムにアクセスできます。", bullets: ["スケジュール: 公演スケジュールの確認", "シフト提出: 毎月のシフト希望を提出", "GM確認: 貸切予約のGM可否を回答", "貸切確認: 貸切リクエストの確認"] },
        { title: "Q: メールが届きません", body: "迷惑メールフォルダを確認してください。それでも届かない場合は、管理者に再招待を依頼してください。" },
        { title: "Q: リンクの有効期限が切れました", body: "管理者がスタッフ一覧から「連携」→「新規招待」で同じメールアドレスに再度招待を送ることができます。" },
        { title: "Q: パスワードを忘れました", body: "ログイン画面の「パスワードを忘れた方」からリセットできます。または管理者に再招待を依頼してください。" },
      ]
    },
    {
      heading: "応用シナリオ",
      items: [
        { title: "スタッフがプライベートで遊びに来る場合", body: "スタッフアカウントのまま予約サイトから予約可能です。システムは「スタッフ」と認識しつつ「顧客」として予約を受け付けます。" },
        { title: "常連さんをスタッフとしてスカウトする場合", body: "既に顧客アカウントを持っている方のメールアドレスで「招待」を行ってください。これまでの予約履歴やアカウント情報を引き継いだまま、スタッフ権限が付与されます。" },
        { title: "紐付けミスを修正する場合", body: "間違ったアカウントを紐付けてしまった場合は、「連携解除」を行ってください。\n誤って紐付けられたユーザーは即座に「一般顧客」に戻り、その後正しいメールアドレスで再度招待を行ってください。" },
      ]
    },
    {
      heading: "Discord連携設定",
      intro: "Discord通知機能を使用するには、各スタッフのDiscord IDとチャンネルIDの設定が必要です。これにより、貸切予約のGM確認通知やシフトリマインダーが届くようになります。",
      items: [
        { title: "Discord ID", subtitle: "用途: シフト未提出リマインダーでのメンション / 貸切予約でGMがボタンを押した時の回答者特定", orderedBullets: ["Discordの設定 → 詳細設定 → 「開発者モード」をON", "該当ユーザーのアイコンを右クリック", "「ユーザーIDをコピー」を選択"], note: "例: 1234567890123456789" },
        { title: "Discord チャンネルID", subtitle: "用途: 貸切予約のGM確認通知（ボタン付き）/ 個人用の通知チャンネルとして使用", orderedBullets: ["Discordの設定 → 詳細設定 → 「開発者モード」をON", "通知を送りたいチャンネルを右クリック", "「チャンネルIDをコピー」を選択"], note: "例: 9876543210987654321" },
        { title: "Discord通知の種類", bullets: ["貸切予約GM確認 → 各GMの個人チャンネル → discord_channel_id が必要", "シフト提出完了 → 全体通知チャンネル → 管理者設定が必要", "シフト未提出リマインダー → 全体通知チャンネル + メンション → discord_id が必要"] },
        { title: "注意事項", bullets: ["Discord IDとチャンネルIDが設定されていないスタッフには、対応する通知が届きません。", "貸切予約のGM確認通知を受け取るには、そのシナリオの「担当GM」として設定されている必要があります。", "Botがチャンネルにメッセージを送信する権限を持っていることを確認してください。"], noteType: "warning" },
      ]
    }
  ]
}

// Icon map for lifecycle items (fixed positions)
const LIFECYCLE_ICONS = [UserPlus, UserMinus, RefreshCw, ShieldCheck]
const LIFECYCLE_COLORS = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500']
const LIFECYCLE_TEXT_COLORS = ['text-blue-500', 'text-red-500', 'text-green-500', 'text-yellow-500']

export function StaffManual({ content }: { content?: HardcodedPageContent }) {
  const c = content ?? STAFF_DEFAULT

  const lifecycleSection = c.sections[0]
  const inviteSection = c.sections[1]
  const advancedSection = c.sections[2]
  const discordSection = c.sections[3]

  const inviteSteps = inviteSection?.items.slice(0, 3) ?? []
  const inviteFaqs = inviteSection?.items.slice(3) ?? []

  const discordIdItem = discordSection?.items[0]
  const discordChannelItem = discordSection?.items[1]
  const discordNotifItem = discordSection?.items[2]
  const discordNoteItem = discordSection?.items[3]

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      {/* 概要 */}
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">スタッフ・アカウント管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          {c.description}
        </p>
      </div>

      {/* 基本的なライフサイクル */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{lifecycleSection?.heading ?? ''}</h3>
        </div>

        <div className="space-y-4">
          {lifecycleSection?.items.map((item, idx) => {
            const Icon = LIFECYCLE_ICONS[idx] ?? RefreshCw
            const colorClass = LIFECYCLE_COLORS[idx] ?? 'bg-gray-500'
            const textColorClass = LIFECYCLE_TEXT_COLORS[idx] ?? 'text-gray-500'
            return (
              <div key={idx} className="bg-muted/30 rounded-lg p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 h-6 w-6 rounded-full ${colorClass} text-white text-xs font-bold flex items-center justify-center`}>{idx + 1}</span>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${textColorClass}`} />
                      <h4 className="font-medium">{item.title}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    <div className="bg-background rounded-md p-3 text-sm space-y-2">
                      {item.scene && <p><strong>{item.scene.split(': ')[0]}:</strong> {item.scene.split(': ').slice(1).join(': ')}</p>}
                      {item.bullets && (
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          {item.bullets.map((b, i) => (
                            <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/「([^」]+)」/g, '「<strong>$1</strong>」').replace(/（([^）]+)）/g, '（<strong>$1</strong>）') }} />
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 招待メール送信後の流れ */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{inviteSection?.heading ?? ''}</h3>
        </div>

        {inviteSection?.intro && (
          <p className="text-muted-foreground text-sm">
            {inviteSection.intro}
          </p>
        )}

        <div className="space-y-4">
          {/* Step 1: 招待メール受信 */}
          {inviteSteps[0] && (
            <div className="bg-muted/30 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">1</span>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <h4 className="font-medium">{inviteSteps[0].title}</h4>
                  </div>
                  <div className="bg-background rounded-md p-3 text-sm space-y-2">
                    <p className="text-muted-foreground">{inviteSteps[0].body}</p>
                    <div className="border rounded-md p-3 bg-white dark:bg-gray-900 text-xs space-y-2">
                      <p><strong>件名:</strong> 【MMQ】スタッフアカウント招待</p>
                      <p><strong>内容:</strong> 「パスワードを設定する」ボタン付きのメール</p>
                    </div>
                    {inviteSteps[0].note && (
                      <p className="text-xs text-muted-foreground">{inviteSteps[0].note}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: パスワード設定 */}
          {inviteSteps[1] && (
            <div className="bg-muted/30 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">2</span>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-blue-500" />
                    <h4 className="font-medium">{inviteSteps[1].title}</h4>
                  </div>
                  <div className="bg-background rounded-md p-3 text-sm space-y-2">
                    <p className="text-muted-foreground">{inviteSteps[1].body}</p>
                    {inviteSteps[1].bullets && (
                      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                        {inviteSteps[1].bullets.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    )}
                    {inviteSteps[1].note && (
                      <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded p-2 text-xs text-yellow-700 dark:text-yellow-300">
                        {inviteSteps[1].note}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: ログイン完了 */}
          {inviteSteps[2] && (
            <div className="bg-muted/30 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">3</span>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-green-500" />
                    <h4 className="font-medium">{inviteSteps[2].title}</h4>
                  </div>
                  <div className="bg-background rounded-md p-3 text-sm space-y-2">
                    <p className="text-muted-foreground">{inviteSteps[2].body}</p>
                    {inviteSteps[2].bullets && (
                      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                        {inviteSteps[2].bullets.map((b, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/^([^:：]+)[：:]/, '<strong>$1:</strong>') }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* よくある質問 */}
        {inviteFaqs.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b">
              <h4 className="font-medium text-sm">招待に関するよくある質問</h4>
            </div>
            <div className="divide-y">
              {inviteFaqs.map((faq, i) => (
                <div key={i} className="p-4">
                  <p className="font-medium text-sm mb-1">{faq.title}</p>
                  <p className="text-sm text-muted-foreground">{faq.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 応用シナリオ */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{advancedSection?.heading ?? ''}</h3>
        </div>

        <div className="space-y-3">
          {advancedSection?.items[0] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{advancedSection.items[0].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {advancedSection.items[0].body}
              </p>
            </div>
          )}

          {advancedSection?.items[1] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{advancedSection.items[1].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {advancedSection.items[1].body}
              </p>
            </div>
          )}

          {advancedSection?.items[2] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{advancedSection.items[2].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {advancedSection.items[2].body}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Discord連携設定 */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{discordSection?.heading ?? ''}</h3>
        </div>

        {discordSection?.intro && (
          <p className="text-muted-foreground text-sm">
            {discordSection.intro}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Discord ID */}
          {discordIdItem && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-medium text-indigo-900 dark:text-indigo-100">{discordIdItem.title}</h4>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">用途</p>
                  <ul className="list-disc pl-5 text-indigo-700 dark:text-indigo-300 space-y-1">
                    {discordIdItem.subtitle?.split(' / ').map((u, i) => (
                      <li key={i}>{u.replace(/^用途: /, '')}</li>
                    ))}
                  </ul>
                </div>
                {discordIdItem.orderedBullets && (
                  <div>
                    <p className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">取得方法</p>
                    <ol className="list-decimal pl-5 text-indigo-700 dark:text-indigo-300 space-y-1">
                      {discordIdItem.orderedBullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ol>
                  </div>
                )}
                {discordIdItem.note && (
                  <div className="bg-white dark:bg-indigo-900/50 rounded p-2 font-mono text-xs text-indigo-600 dark:text-indigo-300">
                    {discordIdItem.note}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Discord チャンネルID */}
          {discordChannelItem && (
            <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <h4 className="font-medium text-purple-900 dark:text-purple-100">{discordChannelItem.title}</h4>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-purple-800 dark:text-purple-200 mb-1">用途</p>
                  <ul className="list-disc pl-5 text-purple-700 dark:text-purple-300 space-y-1">
                    {discordChannelItem.subtitle?.split(' / ').map((u, i) => (
                      <li key={i}>{u.replace(/^用途: /, '')}</li>
                    ))}
                  </ul>
                </div>
                {discordChannelItem.orderedBullets && (
                  <div>
                    <p className="font-medium text-purple-800 dark:text-purple-200 mb-1">取得方法</p>
                    <ol className="list-decimal pl-5 text-purple-700 dark:text-purple-300 space-y-1">
                      {discordChannelItem.orderedBullets.map((b, i) => <li key={i}>{b}</li>)}
                    </ol>
                  </div>
                )}
                {discordChannelItem.note && (
                  <div className="bg-white dark:bg-purple-900/50 rounded p-2 font-mono text-xs text-purple-600 dark:text-purple-300">
                    {discordChannelItem.note}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 通知の種類 */}
        {discordNotifItem && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b">
              <h4 className="font-medium text-sm">{discordNotifItem.title}</h4>
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
                  {discordNotifItem.bullets?.map((b, i) => {
                    const parts = b.split(' → ')
                    return (
                      <tr key={i} className={i < (discordNotifItem.bullets?.length ?? 0) - 1 ? 'border-b' : ''}>
                        <td className="py-3 px-4">{parts[0] ?? ''}</td>
                        <td className="py-3 px-4">{parts[1] ?? ''}</td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="text-xs font-normal">{parts[2] ?? ''}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 注意事項 */}
        {discordNoteItem && (
          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-medium">{discordNoteItem.title}</p>
                {discordNoteItem.bullets && (
                  <ul className="list-disc pl-5 space-y-1 text-yellow-700 dark:text-yellow-300">
                    {discordNoteItem.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
