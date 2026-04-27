import {
  CheckCircle2, AlertCircle,
  Search, Mail, MessageSquare, Clock, XCircle, Trash2
} from 'lucide-react'
import type { HardcodedPageContent } from '@/types/hardcodedContent'

export const RESERVATION_DEFAULT: HardcodedPageContent = {
  description: "予約の確認、ステータス変更、キャンセル対応など、予約に関する一連の業務フローを解説します。",
  sections: [
    {
      heading: "予約ステータスと対応フロー",
      items: [
        { title: "保留 (Pending)", subtitle: "対応待ちの状態", body: "申し込み直後の状態です。内容を確認し、問題なければ確定処理を行います。", note: "アクション: 内容確認 → 確定ボタン" },
        { title: "確定 (Confirmed)", subtitle: "予約完了の状態", body: "お客様に参加確定メールが送信され、スケジュール上の席が確保されています。", note: "アクション: 当日を迎えるのみ" },
        { title: "キャンセル", subtitle: "無効な状態", body: "お客様都合または公演中止によりキャンセルされた状態です。席は解放されます。", note: "注意: 復元はできません" },
      ]
    },
    {
      heading: "主な対応シーン",
      items: [
        {
          title: "貸切リクエストが届いた場合",
          body: "貸切予約は「リクエスト（承認待ち）」として届きます。",
          orderedBullets: ["「貸切確認」ページで、希望日時とGMの空き状況を確認します。", "問題なければ「承認」ボタンを押します。自動的に予約が確定し、スケジュールが押さえられます。", "都合が悪い場合は、代案を提示するか「却下」を選択します。"]
        },
        { title: "直前の人数変更・キャンセル", body: "電話などでキャンセル連絡を受けた場合は、管理画面から手動でステータスを「キャンセル」に変更してください。\nメモ欄に「電話にて受付（担当：〇〇）」と残しておくと、後で経緯が分かりやすくなります。" },
        {
          title: "貸切グループの削除依頼が届いた場合",
          body: "お客様からメールなどで「グループを消したい」と連絡が来た場合の対応手順です。",
          orderedBullets: ["メール本文に記載の招待コード（例: A65EPKHY）を手元に控えます。", "管理画面の「貸切確認」ページを開きます。", "検索欄に招待コードを入力し、該当のグループを見つけます。", "カードをクリックして詳細を開き、一番下にある「この申込を完全に削除する」（赤いリンク）をクリックします。", "確認ダイアログが表示されたら「OK」を押して完了です。"],
          note: "注意: 削除すると、グループ・メンバー・候補日程・チャット履歴がすべて消えます。復元はできないため、お客様の意思を必ず確認してから実行してください。",
          noteType: "warning"
        },
        { title: "過去の予約を探す", body: "「フィルター」機能を使って、特定のお客様名や電話番号、予約番号で検索できます。\n「未払い」のみを抽出して、月末の請求漏れチェックにも活用できます。" }
      ]
    }
  ]
}

export function ReservationManual({ content }: { content?: HardcodedPageContent }) {
  const c = content ?? RESERVATION_DEFAULT
  const statusItems = c.sections[0]?.items ?? []
  const scenarioItems = c.sections[1]?.items ?? []

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">予約管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          {c.description}
        </p>
      </div>

      {/* ステータスフロー */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{c.sections[0]?.heading ?? ''}</h3>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 保留 */}
          <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">STEP 1</span>
            </div>
            <h4 className="font-medium text-yellow-900 dark:text-yellow-100">{statusItems[0]?.title ?? ''}</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">{statusItems[0]?.subtitle ?? ''}</p>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p>{statusItems[0]?.body ?? ''}</p>
            </div>
            <div className="bg-white dark:bg-yellow-900/50 rounded p-2 text-xs text-yellow-700 dark:text-yellow-300">
                <strong>{statusItems[0]?.note?.split(': ')[0] ?? 'アクション'}:</strong> {statusItems[0]?.note?.split(': ').slice(1).join(': ') ?? ''}
              </div>
          </div>

          {/* 確定 */}
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">STEP 2</span>
            </div>
            <h4 className="font-medium text-green-900 dark:text-green-100">{statusItems[1]?.title ?? ''}</h4>
            <p className="text-sm text-green-700 dark:text-green-300">{statusItems[1]?.subtitle ?? ''}</p>
            <div className="text-sm text-green-800 dark:text-green-200">
              <p>{statusItems[1]?.body ?? ''}</p>
            </div>
            <div className="bg-white dark:bg-green-900/50 rounded p-2 text-xs text-green-700 dark:text-green-300">
                <strong>{statusItems[1]?.note?.split(': ')[0] ?? 'アクション'}:</strong> {statusItems[1]?.note?.split(': ').slice(1).join(': ') ?? ''}
              </div>
          </div>

          {/* キャンセル */}
          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">STEP 3</span>
            </div>
            <h4 className="font-medium text-red-900 dark:text-red-100">{statusItems[2]?.title ?? ''}</h4>
            <p className="text-sm text-red-700 dark:text-red-300">{statusItems[2]?.subtitle ?? ''}</p>
            <div className="text-sm text-red-800 dark:text-red-200">
              <p>{statusItems[2]?.body ?? ''}</p>
            </div>
            <div className="bg-white dark:bg-red-900/50 rounded p-2 text-xs text-red-700 dark:text-red-300">
                <strong>{statusItems[2]?.note?.split(': ')[0] ?? '注意'}:</strong> {statusItems[2]?.note?.split(': ').slice(1).join(': ') ?? ''}
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
          <h3 className="text-lg font-semibold">{c.sections[1]?.heading ?? ''}</h3>
        </div>

        <div className="space-y-3">
          {/* 貸切リクエスト */}
          {scenarioItems[0] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{scenarioItems[0].title}</h4>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{scenarioItems[0].body}</p>
                {scenarioItems[0].orderedBullets && (
                  <ol className="list-decimal pl-5 space-y-1">
                    {scenarioItems[0].orderedBullets.map((bullet, i) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: bullet.replace(/「([^」]+)」/g, '<strong>「$1」</strong>') }} />
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {/* 直前キャンセル */}
          {scenarioItems[1] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{scenarioItems[1].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {scenarioItems[1].body}
              </p>
            </div>
          )}

          {/* 貸切グループ削除 */}
          {scenarioItems[2] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{scenarioItems[2].title}</h4>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{scenarioItems[2].body}</p>
                {scenarioItems[2].orderedBullets && (
                  <ol className="list-decimal pl-5 space-y-1">
                    {scenarioItems[2].orderedBullets.map((bullet, i) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: bullet.replace(/「([^」]+)」/g, '<strong>「$1」</strong>') }} />
                    ))}
                  </ol>
                )}
                {scenarioItems[2].note && (
                  <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 mt-2">
                    <strong>{scenarioItems[2].note.split(': ')[0]}:</strong> {scenarioItems[2].note.split(': ').slice(1).join(': ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 過去の予約を探す */}
          {scenarioItems[3] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{scenarioItems[3].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {scenarioItems[3].body}
              </p>
            </div>
          )}

          {/* 追加シナリオ（4件目以降） */}
          {scenarioItems.slice(4).map((item, i) => (
            <div key={i} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{item.title}</h4>
              </div>
              {item.body && <p className="text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>}
              {item.orderedBullets && (
                <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground mt-2">
                  {item.orderedBullets.map((bullet, j) => <li key={j}>{bullet}</li>)}
                </ol>
              )}
              {item.note && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 mt-2">
                  {item.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
