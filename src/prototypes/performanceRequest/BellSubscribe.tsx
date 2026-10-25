/**
 * 作品ページの「公演追加のお知らせを受け取る」ベル（試作・架空の購読）。
 * 開催リクエストをしていなくても登録できる。登録・解除はこのブラウザの中だけ。
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { subscribe, unsubscribe } from './actions'
import { PROTO_ORGANIZATION, PROTO_STORES, findProtoStore, type ProtoScenario } from './fixtures'
import type { PerformanceSubscription } from './notify'
import { protoPaths } from './routes'
import { PROTO_STORAGE_SCOPE_LABEL } from './storage'

export function BellSubscribe({ scenario, subscription }: { scenario: ProtoScenario; subscription: PerformanceSubscription | undefined }) {
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [storeIds, setStoreIds] = useState<string[]>([])
  const subscribed = Boolean(subscription)

  const handleBell = () => {
    if (subscribed) { unsubscribe(scenario.id); setOpen(false); return }
    setOpen((v) => !v)
  }

  const scopeText = (ids: string[]) => (ids.length === 0 ? 'すべての店舗' : ids.map((id) => findProtoStore(id)?.name ?? id).join('・'))

  return (
    <div className="space-y-2" data-testid="proto-bell">
      <Button
        type="button"
        variant={subscribed ? 'secondary' : 'outline'}
        size="lg"
        onClick={handleBell}
        aria-pressed={subscribed}
        className="gap-1.5"
      >
        {subscribed ? <BellRing className="h-4 w-4 text-amber-600" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
        {subscribed ? 'お知らせ登録中（押すと解除）' : '公演追加のお知らせを受け取る'}
      </Button>

      {subscribed && subscription ? (
        <p className="text-xs text-muted-foreground">
          対象: 「{scenario.title}」／{PROTO_ORGANIZATION.name}／{scopeText(subscription.storeIds)}。
          解除は、このベルをもう一度押すか、<Link className="underline" to={protoPaths.notifications()}>通知一覧</Link>から。
        </p>
      ) : null}

      {open && !subscribed ? (
        <div className="space-y-3 rounded-lg border bg-background p-3 text-sm" data-testid="proto-bell-panel">
          <p className="font-medium">公演追加のお知らせ</p>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">作品</dt><dd>「{scenario.title}」</dd>
            <dt className="text-muted-foreground">組織</dt><dd>{PROTO_ORGANIZATION.name}の公演だけ</dd>
            <dt className="text-muted-foreground">店舗</dt>
            <dd className="space-y-1">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="proto-bell-scope" checked={!narrow} onChange={() => setNarrow(false)} />すべての店舗
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="proto-bell-scope" checked={narrow} onChange={() => setNarrow(true)} />店舗を絞る
              </label>
              {narrow ? (
                <StoreMultiSelect stores={PROTO_STORES} selectedStoreIds={storeIds} onStoreIdsChange={setStoreIds} hideLabel placeholder="店舗を選ぶ" />
              ) : null}
            </dd>
          </dl>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>この作品の公演が公開され、予約の受付が始まったときにお知らせします。</li>
            <li>予約の確定やお席の確保ではありません。ご参加には公演ページから別途ご予約が必要です。</li>
            <li>解除は、同じベルをもう一度押すか、通知一覧の「お知らせの登録」から行えます。</li>
            <li>試作: 架空の登録です。保存は{PROTO_STORAGE_SCOPE_LABEL}で、実際のお知らせは届きません。</li>
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="md" onClick={() => setOpen(false)}>やめる</Button>
            <Button
              type="button"
              size="md"
              disabled={narrow && storeIds.length === 0}
              onClick={() => { subscribe(scenario.id, narrow ? storeIds : []); setOpen(false) }}
            >
              登録する
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
