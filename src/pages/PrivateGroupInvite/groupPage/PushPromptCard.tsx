/**
 * 通知の案内カード（段階 3）。グループに参加した直後・初めて発言した直後に、画面の下に重ねて出す。
 * iPhone の Safari（ホーム画面に追加していない）では、ホーム画面に追加すると届くことと手順を 3 行で出す。
 * 端末が通知を止めている（許可が「拒否」）ときは、iPhone／Android／パソコンを切り替えて許可の手順を出す（点検 46）。
 */
import { useMemo, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PushPromptKind } from './useGroupPush'
import { PUSH_BLOCKED_STEPS, PUSH_HELP_DEVICES, detectPushHelpDevice, type PushHelpDevice } from './pushBlockedHelp'

interface PushPromptCardProps {
  kind: PushPromptKind
  busy: boolean
  onAccept: () => void
  onDismiss: () => void
}

export function PushPromptCard({ kind, busy, onAccept, onDismiss }: PushPromptCardProps) {
  if (kind === 'blocked') return <PushBlockedCard onDismiss={onDismiss} />
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96" role="dialog" aria-label="通知の受け取り" data-testid="push-prompt-card" data-kind={kind}>
      <div className="bg-card border border-border rounded-lg shadow-lg p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
            <Bell className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-snug">返事に気づけるよう通知を受け取りますか？</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">新しいメッセージや日程が決まったことを、この端末にお知らせします。グループごとに右上の ⋮ から止められます。</p>
          </div>
          <button type="button" onClick={onDismiss} className="-mr-1 -mt-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="閉じる">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {kind === 'ios' ? (
          <div className="mt-3 rounded-md bg-muted/60 px-3 py-2.5" data-testid="push-prompt-ios">
            <p className="text-xs font-bold text-foreground">iPhone では、ホーム画面に追加すると届きます</p>
            <ol className="mt-1.5 space-y-1 text-xs text-foreground leading-relaxed list-decimal pl-4">
              <li>画面下の共有ボタン（四角から上向きの矢印）を押す</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>ホーム画面の MMQ から開き、右上の ⋮ で「通知」をオンにする</li>
            </ol>
            <div className="mt-2.5 flex justify-end">
              <Button type="button" variant="outline" className="h-9 px-3 text-sm rounded-md bg-background border-zinc-300" onClick={onDismiss}>わかった</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="flex-1 h-10 text-sm rounded-md bg-background border-zinc-300" onClick={onDismiss} disabled={busy}>今はしない</Button>
            <Button type="button" className="flex-1 h-10 text-sm font-bold rounded-md bg-purple-600 hover:bg-purple-700 text-white" onClick={onAccept} disabled={busy} data-testid="push-prompt-accept">受け取る</Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** 端末が通知を止めているときの手順（端末を切り替えられる。既定はいま使っている端末） */
function PushBlockedCard({ onDismiss }: { onDismiss: () => void }) {
  const detected = useMemo(() => (typeof navigator === 'undefined' ? 'pc' : detectPushHelpDevice(navigator.userAgent, navigator.maxTouchPoints || 0)), [])
  const [device, setDevice] = useState<PushHelpDevice>(detected)
  return (
    <div className="fixed inset-x-3 bottom-24 z-40 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96" role="dialog" aria-label="通知の許可の手順" data-testid="push-prompt-card" data-kind="blocked">
      <div className="bg-card border border-border rounded-lg shadow-lg p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <Bell className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-snug">この端末では通知が止められています</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">端末やブラウザの設定で、このサイトの通知を許可すると届くようになります。</p>
          </div>
          <button type="button" onClick={onDismiss} className="-mr-1 -mt-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="閉じる">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex gap-1" role="tablist" aria-label="端末">
          {PUSH_HELP_DEVICES.map(d => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={device === d.id}
              onClick={() => setDevice(d.id)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${device === d.id ? 'border-purple-300 bg-purple-50 font-bold text-purple-800' : 'border-border bg-background text-muted-foreground'}`}
              data-testid={`push-help-${d.id}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <ol className="mt-2 rounded-md bg-muted/60 px-3 py-2.5 space-y-1 text-xs text-foreground leading-relaxed list-decimal pl-7" data-testid="push-blocked-steps">
          {PUSH_BLOCKED_STEPS[device].map(step => <li key={step}>{step}</li>)}
        </ol>
        <div className="mt-2.5 flex justify-end">
          <Button type="button" variant="outline" className="h-9 px-3 text-sm rounded-md bg-background border-zinc-300" onClick={onDismiss}>閉じる</Button>
        </div>
      </div>
    </div>
  )
}
