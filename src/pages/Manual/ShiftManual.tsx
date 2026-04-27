import {
  Calendar, UserCheck, AlertTriangle, FileText
} from 'lucide-react'
import type { HardcodedPageContent } from '@/types/hardcodedContent'

export const SHIFT_DEFAULT: HardcodedPageContent = {
  description: "毎月のシフト提出から、公演スケジュールの作成、スタッフ配置までの流れを解説します。",
  sections: [
    {
      heading: "毎月の作業フロー",
      items: [
        { title: "提出期間の設定", body: "「シフト提出」ページで、スタッフがシフトを入力できる期間（例: 毎月1日〜10日）と、対象の月を設定します。", note: "ポイント: 提出期限を過ぎると、スタッフは画面から入力できなくなります。変更が必要な場合は管理者が直接修正します。" },
        { title: "スケジュール作成", body: "「スケジュール管理」ページで、日付セルをクリックして公演枠を作成します。または、CSVインポート機能を使って一括登録することも可能です。" },
        { title: "スタッフ配置 (GM決定)", body: "作成した公演枠にGM（ゲームマスター）を割り当てます。シフト提出済みのスタッフは、空き状況がアイコンで表示されるので、スムーズに配置できます。" },
        { title: "公開", body: "スケジュールが固まったら、予約サイトでの受付を開始します。\n（現在は作成と同時に公開される仕様です。将来的に「下書き」機能が追加される可能性があります）" },
      ]
    },
    {
      heading: "便利な機能",
      items: [
        { title: "GMロールの管理", body: "1つの公演に複数のスタッフを配置できます。", bullets: ["メインGM: 公演の進行責任者", "サブGM: 補助スタッフ（給与計算対象）", "スタッフ参加: 人数合わせなどで参加するスタッフ（給与対象外・予約リストに追加）"], note: "これらを使い分けることで、正確な給与計算と予約管理が可能になります。" },
        { title: "公演の中止と復活", body: "急な事情で公演ができなくなった場合は「中止」に設定します。\n削除するのではなく「中止」ステータスにすることで、履歴を残しつつ予約受付を停止できます。状況が変われば「復活」させることも可能です。" },
      ]
    }
  ]
}

export function ShiftManual({ content }: { content?: HardcodedPageContent }) {
  const c = content ?? SHIFT_DEFAULT

  const flowSection = c.sections[0]
  const featuresSection = c.sections[1]

  return (
    <div className="space-y-10 max-w-4xl mx-auto pb-12">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">シフト・スケジュール管理</h2>
        <p className="text-muted-foreground leading-relaxed">
          {c.description}
        </p>
      </div>

      {/* 月次フロー */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{flowSection?.heading ?? ''}</h3>
        </div>

        <div className="space-y-4">
          {flowSection?.items.map((item, idx) => (
            <div key={idx} className="bg-muted/30 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                <div className="space-y-2 flex-1">
                  <h4 className="font-medium">{item.title}</h4>
                  {item.body && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {item.body}
                    </p>
                  )}
                  {item.note && (
                    <div className="bg-background rounded-md p-3 text-sm text-muted-foreground">
                      <strong className="text-foreground">{item.note.split(': ')[0]}:</strong> {item.note.split(': ').slice(1).join(': ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 便利機能 */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{featuresSection?.heading ?? ''}</h3>
        </div>

        <div className="space-y-3">
          {/* GMロールの管理 */}
          {featuresSection?.items[0] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{featuresSection.items[0].title}</h4>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>{featuresSection.items[0].body}</p>
                {featuresSection.items[0].bullets && (
                  <ul className="list-disc pl-5 space-y-1">
                    {featuresSection.items[0].bullets.map((b, i) => (
                      <li key={i} dangerouslySetInnerHTML={{ __html: b.replace(/^([^:：]+)[：:]/, '<strong>$1:</strong>') }} />
                    ))}
                  </ul>
                )}
                {featuresSection.items[0].note && (
                  <p>{featuresSection.items[0].note}</p>
                )}
              </div>
            </div>
          )}

          {/* 公演の中止と復活 */}
          {featuresSection?.items[1] && (
            <div className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{featuresSection.items[1].title}</h4>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {featuresSection.items[1].body}
              </p>
            </div>
          )}

          {/* 追加アイテム */}
          {featuresSection?.items.slice(2).map((item, i) => (
            <div key={i} className="border rounded-lg p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">{item.title}</h4>
              </div>
              {item.body && <p className="text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
