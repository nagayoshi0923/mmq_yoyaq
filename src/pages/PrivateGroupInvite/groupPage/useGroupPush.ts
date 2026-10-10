/**
 * グループページのプッシュ通知（段階 3）: 案内カードを出す時機・「受け取る」・⋮ の通知 ON/OFF。
 * - 開いた瞬間には許可を求めない。グループに参加した直後と、初めて発言した直後に案内カードを出す。
 * - 「今はしない」で閉じたら 30 日は出さない。iPhone の Safari（ホーム画面に追加していない）はホーム画面への追加の手順を出す。
 * - 会員だけ（ゲストはプッシュが無く、1 日 1 回のメールで未読をまとめて知らせる）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/lib/errorFields'
import { groupPushSetting, subscribeWebPush, syncWebPushSubscription } from '@/lib/webPush'
import { currentPushSupport, isPromptSnoozed, notificationPermission, snoozePrompt, takePromptPending } from '@/lib/webPushSupport'
import { MESSAGE_SENT_EVENT, type MessageSentDetail } from '@/pages/PrivateGroupManage/components/chat/chatVisibility'

export type PushPromptKind = 'ask' | 'ios'

export interface GroupPush {
  /** ⋮ に通知の切り替えを出すか（会員だけ） */
  available: boolean
  /** このグループの通知（既定 ON） */
  enabled: boolean
  /** ⋮ に出す状態（このグループが ON で、この端末で受け取れる） */
  on: boolean
  /** この端末で受け取れる状態か（許可済みで購読がある） */
  deviceReady: boolean
  prompt: PushPromptKind | null
  busy: boolean
  accept: () => Promise<void>
  dismiss: () => void
  toggle: () => Promise<void>
}

export function useGroupPush(groupId: string, isMember: boolean): GroupPush {
  const support = useMemo(() => currentPushSupport(), [])
  const [enabled, setEnabled] = useState(true)
  const [deviceReady, setDeviceReady] = useState(false)
  const [prompt, setPrompt] = useState<PushPromptKind | null>(null)
  const [busy, setBusy] = useState(false)
  const available = isMember && support !== 'unsupported'

  // 開いたとき: 許可済みの端末なら、いまの人の購読として保存し直す。グループの ON/OFF を読む
  useEffect(() => {
    if (!isMember || !groupId) return
    let cancelled = false
    void syncWebPushSubscription().then(ready => { if (!cancelled) setDeviceReady(ready) })
    groupPushSetting(groupId).then(s => { if (!cancelled) setEnabled(s.push_enabled) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [groupId, isMember])

  const maybeShow = useCallback(() => {
    if (!available || isPromptSnoozed()) return
    if (support === 'ios_needs_home_screen') { setPrompt('ios'); return }
    if (notificationPermission() === 'denied') return
    // 既に受け取れる端末には出さない（購読の確認は非同期なので、ここで改めて確かめる）
    void syncWebPushSubscription().then(ready => {
      setDeviceReady(ready)
      if (!ready) setPrompt('ask')
    })
  }, [available, support])

  // 参加した直後（参加の画面で印を付けてある）
  useEffect(() => {
    if (groupId && takePromptPending(groupId)) maybeShow()
  }, [groupId, maybeShow])

  // 初めて発言した直後
  useEffect(() => {
    const onSent = (event: Event) => {
      const detail = (event as CustomEvent<MessageSentDetail>).detail
      if (detail?.groupId === groupId && detail.firstOwn) maybeShow()
    }
    window.addEventListener(MESSAGE_SENT_EVENT, onSent)
    return () => window.removeEventListener(MESSAGE_SENT_EVENT, onSent)
  }, [groupId, maybeShow])

  /** 「受け取る」: 許可を求めて購読を保存（ボタンを押した操作の中で、通信より先に許可を求める） */
  const subscribe = useCallback(async (): Promise<boolean> => {
    const result = await subscribeWebPush()
    if (result === 'denied') {
      toast.error('通知が許可されませんでした。ブラウザの設定（サイトの通知）から許可できます')
      return false
    }
    setDeviceReady(true)
    return true
  }, [])

  const accept = useCallback(async () => {
    setBusy(true)
    try {
      if (!(await subscribe())) { snoozePrompt(); setPrompt(null); return }
      if (!enabled) setEnabled((await groupPushSetting(groupId, true)).push_enabled)
      setPrompt(null)
      toast.success('この端末で通知を受け取ります')
    } catch (err) {
      toast.error(getErrorMessage(err) || '通知を設定できませんでした')
    } finally {
      setBusy(false)
    }
  }, [subscribe, enabled, groupId])

  const dismiss = useCallback(() => {
    snoozePrompt()
    setPrompt(null)
  }, [])

  /** ⋮ の通知 ON/OFF（このグループだけ。端末の購読は他のグループのために残す） */
  const toggle = useCallback(async () => {
    setBusy(true)
    try {
      // 表示は「このグループが ON かつ この端末で受け取れる」とき ON。ON のときに押したらこのグループを止める
      if (enabled && deviceReady) {
        setEnabled((await groupPushSetting(groupId, false)).push_enabled)
        toast.success('このグループの通知をオフにしました')
        return
      }
      if (support === 'ios_needs_home_screen') { setPrompt('ios'); return }
      if (!deviceReady) {
        if (notificationPermission() === 'denied') {
          toast.error('この端末では通知がブロックされています。ブラウザの設定（サイトの通知）から許可してください')
          return
        }
        if (!(await subscribe())) return
      }
      const wasEnabled = enabled
      setEnabled((await groupPushSetting(groupId, true)).push_enabled)
      toast.success(wasEnabled ? 'この端末で通知を受け取ります' : 'このグループの通知をオンにしました')
    } catch (err) {
      toast.error(getErrorMessage(err) || '通知の設定を変えられませんでした')
    } finally {
      setBusy(false)
    }
  }, [enabled, groupId, support, deviceReady, subscribe])

  return { available, enabled, on: enabled && deviceReady, deviceReady, prompt, busy, accept, dismiss, toggle }
}
