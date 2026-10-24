/**
 * お客様の作品ページの試作（架空の作品）。「公演をリクエスト」と「貸切で遊ぶ」を別の意図として並べる。
 */
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarPlus, Clock, Heart, Users, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BellSubscribe } from './BellSubscribe'
import { RequestForm } from './RequestForm'
import { PROTO_ORGANIZATION, PROTO_SCENARIOS, PROTO_SIMULATED_PERFORMANCES, PROTO_STORES, PROTO_USER_ID, findProtoStore } from './fixtures'
import { describePeriod, type PerformanceRequest } from './model'
import { buildNotificationText } from './notify'
import { protoPaths } from './routes'
import { PROTO_STORAGE_SCOPE_LABEL } from './storage'
import { useProtoState } from './useProtoState'

export function CustomerScenarioPage() {
  const [params, setParams] = useSearchParams()
  const scenario = PROTO_SCENARIOS.find((s) => s.id === params.get('scenario')) ?? PROTO_SCENARIOS[0]
  const [state] = useProtoState()
  const [formOpen, setFormOpen] = useState(false)
  const [privateNote, setPrivateNote] = useState(false)
  const [submitted, setSubmitted] = useState<PerformanceRequest | null>(null)
  const subscription = state.subscriptions.find((s) => s.scenarioId === scenario.id && s.userId === PROTO_USER_ID)
  const myRequests = state.requests.filter((r) => r.userId === PROTO_USER_ID && r.scenarioId === scenario.id)

  const samples = useMemo(() => {
    const near = PROTO_SIMULATED_PERFORMANCES.matching
    const other = PROTO_SIMULATED_PERFORMANCES.notMatching
    const s1 = PROTO_SCENARIOS[0]
    return [
      { label: '希望の条件（店舗・時期・曜日）に合う公演のとき', ...buildNotificationText('near_request', s1, findProtoStore(near.storeId) ?? PROTO_STORES[0], near) },
      { label: '条件に合わない公演のとき（ベルの登録など）', ...buildNotificationText('new_performance', s1, findProtoStore(other.storeId) ?? PROTO_STORES[0], other) },
    ]
  }, [])

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="架空の作品を切り替える">
        {PROTO_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setParams({ scenario: s.id }); setFormOpen(false); setSubmitted(null) }}
            className={`rounded-md border px-2.5 py-1 text-xs ${s.id === scenario.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
          >
            {s.title}
          </button>
        ))}
      </div>

      <article className="space-y-4">
        <header className="rounded-lg bg-slate-900 p-4 text-white">
          <p className="text-xs opacity-80">{scenario.author}・{PROTO_ORGANIZATION.name}</p>
          <h1 className="mt-1 text-lg font-bold md:text-xl">{scenario.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/80">
            <span className="flex items-center gap-1"><Users className="h-4 w-4" aria-hidden />{scenario.playerMin}〜{scenario.playerMax}人</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden />{Math.round(scenario.durationMinutes / 60 * 10) / 10}時間</span>
            <span>¥{scenario.fee.toLocaleString()}〜</span>
            <span className="flex items-center gap-1"><Heart className="h-4 w-4 text-red-400" aria-hidden />いいね {scenario.likes}</span>
          </div>
          <p className="mt-2 text-xs text-white/70">{scenario.synopsis}</p>
        </header>

        <BellSubscribe scenario={scenario} subscription={subscription} />

        <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
          現在、公開中の公演はありません（架空の作品です）。
        </div>

        <section aria-label="遊び方を選ぶ" className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-background p-4">
            <p className="flex items-center gap-1.5 font-semibold"><UserPlus className="h-4 w-4 text-primary" aria-hidden />公演をリクエスト</p>
            <p className="text-sm">1 人から参加できる<strong>オープン公演</strong>の開催を希望します。ほかのお客様と一緒に遊びます。</p>
            <p className="text-xs text-muted-foreground">予約ではありません。店舗が公演を立てたら、公開後にあらためてご予約ください。</p>
            <Button type="button" size="lg" className="w-full" onClick={() => { setFormOpen(true); setSubmitted(null) }}>
              公演をリクエスト
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/50 p-4">
            <p className="flex items-center gap-1.5 font-semibold"><CalendarPlus className="h-4 w-4 text-purple-700" aria-hidden />貸切で遊ぶ</p>
            <p className="text-sm">お仲間だけで遊びます。人数をそろえて、日程を選んで貸切を申し込みます。</p>
            <p className="text-xs text-muted-foreground">1 人から参加したいときは「公演をリクエスト」を使ってください。</p>
            <Button type="button" size="lg" variant="outline" className="w-full" onClick={() => setPrivateNote(true)}>
              貸切で遊ぶ
            </Button>
            {privateNote ? <p className="text-xs text-purple-800">試作のため、ここでは既存の貸切の申込画面へは進みません（本番では今の貸切の申込へ進みます）。</p> : null}
          </div>
        </section>

        {formOpen ? (
          <RequestForm
            scenario={scenario}
            alreadySubscribed={Boolean(subscription)}
            onCancel={() => setFormOpen(false)}
            onSubmitted={(r) => { setSubmitted(r); setFormOpen(false) }}
          />
        ) : null}

        {submitted ? (
          <div role="status" className="space-y-1 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900" data-testid="proto-request-done">
            <p className="font-semibold">リクエストをこのブラウザに保存しました（試作）</p>
            <p>予約ではありません。お席は確保されていません。公演が公開されたら、公演ページから別途ご予約ください。</p>
            <p className="text-xs">保存は{PROTO_STORAGE_SCOPE_LABEL}です。店舗やサーバーには送っていません。管理の試作画面（同じブラウザ）で見え方を確かめられます。</p>
            <Link className="text-xs underline" to={protoPaths.admin()}>管理: スケジュールの開催リクエストを見る</Link>
          </div>
        ) : null}

        {myRequests.length > 0 ? (
          <section className="space-y-2 rounded-lg border bg-background p-4">
            <h2 className="text-sm font-semibold">この作品へのあなたのリクエスト（このブラウザに保存）</h2>
            <ul className="space-y-1 text-sm">
              {myRequests.map((r) => (
                <li key={r.id} className="rounded-md bg-muted/50 px-2 py-1">
                  {r.storeIds.map((id) => findProtoStore(id)?.short_name ?? id).join('・')}／{r.participants}人／{describePeriod(r)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-semibold">公演が公開されたときのお知らせの見本</h2>
          <p className="text-xs text-muted-foreground">開催リクエストをした方・ベルに登録した方に、条件に応じて次のように言い分けます（試作の見本。実際には届きません）。</p>
          <ul className="space-y-2">
            {samples.map((s) => (
              <li key={s.label} className="rounded-md border p-2 text-sm">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-medium">{s.title}</p>
                <p className="text-xs">{s.message}</p>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </>
  )
}
