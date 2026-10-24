/**
 * お客様の通知一覧の試作（既存のベルの一覧 NotificationDropdown の並びに合わせた見た目）。
 * 公演の公開を模擬するボタンもここに置く（このブラウザの中だけに架空の通知を作る。実際には送らない）。
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CalendarPlus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { markRead, markUnread, setPopupDisabled, simulatePublish, unsubscribe } from './actions'
import { PROTO_ORGANIZATION, PROTO_SIMULATED_PERFORMANCES, PROTO_USER_ID, findProtoScenario, findProtoStore } from './fixtures'
import { formatWhen } from './notify'
import { PROTO_STORAGE_SCOPE_LABEL } from './storage'
import { useProtoState } from './useProtoState'

const SIMULATIONS: Array<{ key: keyof typeof PROTO_SIMULATED_PERFORMANCES | 'republish'; label: string; hint: string }> = [
  { key: 'matching', label: '霧の館・渋谷・11/21(土) を公開', hint: 'リクエスト（渋谷・土曜）の条件に合う →「ご希望に近い公演」' },
  { key: 'notMatching', label: '霧の館・新宿・11/25(水) を公開', hint: 'ベルの対象・条件には合わない →「新しい公演が追加されました」' },
  { key: 'republish', label: '11/21 の公演を更新・再公開', hint: '同じ人 × 同じ公演は 2 通目を作らない' },
  { key: 'draft', label: '霧の館の下書きだけ作る', hint: '非公開・受付前なので通知しない' },
  { key: 'otherWork', label: '海辺のアトリエを公開', hint: 'ベルもリクエストもしていない作品なので通知しない' },
]

export function NotificationsPage() {
  const [state] = useProtoState()
  const [result, setResult] = useState<string | null>(null)
  const mine = state.notifications
    .filter((n) => n.userId === PROTO_USER_ID)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const subs = state.subscriptions.filter((s) => s.userId === PROTO_USER_ID)

  const runSimulation = (key: (typeof SIMULATIONS)[number]['key']) => {
    const perf = key === 'republish' ? PROTO_SIMULATED_PERFORMANCES.matching : PROTO_SIMULATED_PERFORMANCES[key]
    const created = simulatePublish(perf)
    const mineCreated = created.filter((n) => n.userId === PROTO_USER_ID).length
    setResult(created.length === 0
      ? '通知は作られませんでした（下書き・重複・対象外）。'
      : `通知を ${created.length} 件作りました（あなた宛て ${mineCreated} 件、架空のほかのお客様宛て ${created.length - mineCreated} 件）。`)
  }

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-lg border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h1 className="flex items-center gap-1.5 text-sm font-semibold"><Bell className="h-4 w-4" aria-hidden />通知一覧（試作）</h1>
            <Button type="button" variant="ghost" size="sm" onClick={() => markRead(mine.map((n) => n.id))} disabled={!mine.some((n) => !n.readAt)}>
              すべて既読
            </Button>
          </div>
          {mine.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">まだ通知はありません。下の「公演の公開を模擬」で架空の通知を作れます。</p>
          ) : (
            <ul className="divide-y" data-testid="proto-notification-list">
              {mine.map((n) => {
                const scenario = findProtoScenario(n.scenarioId)
                const store = findProtoStore(n.storeId)
                return (
                  <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.readAt ? '' : 'bg-blue-50/60'}`}>
                    <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium">{n.title}{n.readAt ? '' : <span className="ml-1.5 text-xs text-blue-700">未読</span>}</p>
                      <p className="text-xs">{n.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {scenario?.title}／{formatWhen(n.date, n.startTime)}／{store?.name}
                        ／きっかけ: {n.sources.map((s) => (s === 'bell' ? 'ベル' : '開催リクエスト')).join('・')}
                        {n.popupDismissedAt ? '／ポップアップは閉じ済み' : n.popupShownAt ? '／ポップアップ表示済み' : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button asChild size="sm" variant="outline">
                          <Link to={n.link} onClick={() => markRead([n.id])}>公演を見る</Link>
                        </Button>
                        {n.readAt ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => markUnread(n.id)}>未読に戻す</Button>
                        ) : (
                          <Button type="button" size="sm" variant="ghost" onClick={() => markRead([n.id])}><Check className="mr-1 h-3 w-3" />既読にする</Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">お知らせの登録（ベル）</h2>
          {subs.length === 0 ? (
            <p className="text-xs text-muted-foreground">登録している作品はありません。作品ページのベルから登録できます。</p>
          ) : (
            <ul className="space-y-1.5 text-sm" data-testid="proto-subscription-list">
              {subs.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                  <span>
                    「{findProtoScenario(s.scenarioId)?.title}」／{PROTO_ORGANIZATION.name}／
                    {s.storeIds.length === 0 ? 'すべての店舗' : s.storeIds.map((id) => findProtoStore(id)?.name ?? id).join('・')}
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => unsubscribe(s.scenarioId)}>解除</Button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <span>
              MMQ を開いたときのお知らせ（ポップアップ）を出す
              <span className="block text-xs text-muted-foreground">出さない設定にしても、通知一覧には残ります。いつでも元に戻せます。</span>
            </span>
            <Switch
              checked={!state.settings.popupDisabled}
              onCheckedChange={(v) => setPopupDisabled(!v)}
              aria-label="MMQ を開いたときのお知らせを出す"
            />
          </label>
        </section>

        <section className="space-y-2 rounded-lg border border-dashed border-amber-400 bg-amber-50/50 p-4">
          <h2 className="text-sm font-semibold">公演の公開を模擬（試作の操作）</h2>
          <p className="text-xs text-muted-foreground">
            店舗が公演を公開したときに作られる通知を、{PROTO_STORAGE_SCOPE_LABEL}に架空で作ります。実際の送信・メール・プッシュ通知はしません。
            先に作品ページで「霧の館の晩餐会」のベル登録や、渋谷・土曜のリクエストをしておくと違いが分かります。
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SIMULATIONS.map((s) => (
              <Button key={s.key} type="button" variant="outline" size="lg" className="h-auto flex-col items-start whitespace-normal py-2 text-left" onClick={() => runSimulation(s.key)}>
                <span className="text-sm">{s.label}</span>
                <span className="text-xs font-normal text-muted-foreground">{s.hint}</span>
              </Button>
            ))}
          </div>
          {result ? <p role="status" className="text-sm" data-testid="proto-simulation-result">{result}</p> : null}
        </section>
      </div>
    </>
  )
}
