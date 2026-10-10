/**
 * ウェブプッシュの購読（この端末）と、グループごとの ON/OFF（貸切グループ 段階 3）。
 * 購読の保存・削除、ON/OFF は本人を確かめる RPC だけ（表には直接触れない）。送るのは Edge Function send-web-push。
 */
import { supabase } from '@/lib/supabase'
import { PUSH_SERVICE_WORKER_PATH, vapidPublicKey } from '@/lib/webPushSupport'

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing && existing.active?.scriptURL.endsWith(PUSH_SERVICE_WORKER_PATH)) return existing
  await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_PATH, { scope: '/' })
  return navigator.serviceWorker.ready
}

/** この端末の購読（無ければ null。サービスワーカーを登録していなければ登録しない） */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('web_push_subscription_save', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw error
}

/**
 * 通知を受け取る（許可を求め、購読して保存）。許可されなければ 'denied'。
 * 必ずボタンを押した操作の中で呼ぶ（ブラウザが許可の確認を出せるのはそのときだけ）。
 */
export async function subscribeWebPush(): Promise<'subscribed' | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await registration()
  const key = vapidPublicKey()
  let sub = await reg.pushManager.getSubscription()
  // 鍵を作り直した環境では古い購読に届かないので取り直す
  const current = sub?.options.applicationServerKey
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== key) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  await saveSubscription(sub)
  return 'subscribed'
}

/** 許可済みで購読がある端末なら、いまログインしている人の購読として保存し直す（端末で人が替わったとき用。失敗は無視） */
export async function syncWebPushSubscription(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const sub = await currentPushSubscription()
    if (!sub) return false
    await saveSubscription(sub)
    return true
  } catch {
    return false
  }
}

/** ログアウトの前に、この端末の購読を外す（次に使う人に前の人の通知が届かないように。失敗は無視） */
export async function removeWebPushSubscription(): Promise<void> {
  try {
    const sub = await currentPushSubscription()
    if (!sub) return
    await supabase.rpc('web_push_subscription_delete', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  } catch {
    // 端末側の購読が残っても、次にログインした人が開いたときに保存し直される
  }
}

export interface GroupPushSetting {
  push_enabled: boolean
  device_count: number
}

/** グループの通知 ON/OFF を読む（enabled を渡すと変える）。参加中の会員だけ */
export async function groupPushSetting(groupId: string, enabled: boolean | null = null): Promise<GroupPushSetting> {
  const { data, error } = await supabase.rpc('private_group_push_setting', { p_group_id: groupId, p_enabled: enabled })
  if (error) throw error
  const d = (data ?? {}) as Partial<GroupPushSetting>
  return { push_enabled: d.push_enabled !== false, device_count: Number(d.device_count ?? 0) }
}
