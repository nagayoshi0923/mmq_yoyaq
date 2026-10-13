/**
 * ウェブプッシュが使える端末か・案内カードを出してよいか（貸切グループ 段階 3）。画面の部品と main.tsx から使う（通信しない）。
 * - iPhone・iPad の Safari は「ホーム画面に追加」して開いたときだけ届く（iOS 16.4 以降）。
 * - 案内カードを「今はしない」で閉じたら 30 日は出さない（この端末に覚える）。
 */
export const PUSH_SERVICE_WORKER_PATH = '/sw.js'
const DISMISS_KEY = 'mmq-push-prompt-dismissed-at'
const PENDING_KEY_PREFIX = 'mmq-push-prompt-pending:'
export const PROMPT_SNOOZE_DAYS = 30

export type PushSupport =
  /** 使える（許可を求められる） */
  | 'supported'
  /** iPhone・iPad の Safari で、ホーム画面に追加していない */
  | 'ios_needs_home_screen'
  /** このブラウザでは使えない・鍵が設定されていない */
  | 'unsupported'

export function isPushServiceWorker(scriptUrl: string): boolean {
  try {
    return new URL(scriptUrl).pathname === PUSH_SERVICE_WORKER_PATH
  } catch {
    return false
  }
}

export function vapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()
}

interface EnvLike {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean
  hasPushManager: boolean
  hasServiceWorker: boolean
  hasNotification: boolean
  hasKey: boolean
}

/** iPhone・iPad（iPadOS の Safari は Mac と名乗るので、触れる画面かで見分ける） */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function detectPushSupport(env: EnvLike): PushSupport {
  if (!env.hasKey) return 'unsupported'
  if (isAppleMobile(env.userAgent, env.maxTouchPoints) && !env.standalone) return 'ios_needs_home_screen'
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported'
  return 'supported'
}

export function currentPushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported'
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  return detectPushSupport({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    standalone,
    hasPushManager: 'PushManager' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasNotification: 'Notification' in window,
    hasKey: vapidPublicKey().length > 0,
  })
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

function safeGet(storage: Storage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null } catch { return null }
}
function safeSet(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (!storage) return
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // 保存できない（プライベートモード等）ときは毎回出るだけ
  }
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)

/** 「今はしない」から 30 日たっていない */
export function isPromptSnoozed(now: number = Date.now()): boolean {
  const at = Number(safeGet(local(), DISMISS_KEY))
  return Number.isFinite(at) && at > 0 && now - at < PROMPT_SNOOZE_DAYS * 24 * 3600 * 1000
}
export function snoozePrompt(now: number = Date.now()) {
  safeSet(local(), DISMISS_KEY, String(now))
}
export function clearPromptSnooze() {
  safeSet(local(), DISMISS_KEY, null)
}

/** 参加した直後に案内を出す印（参加の画面からグループの画面へ移るため、このタブにだけ覚える） */
export function markPromptPending(groupId: string) {
  safeSet(session(), PENDING_KEY_PREFIX + groupId, '1')
}
export function takePromptPending(groupId: string): boolean {
  const pending = safeGet(session(), PENDING_KEY_PREFIX + groupId) === '1'
  if (pending) safeSet(session(), PENDING_KEY_PREFIX + groupId, null)
  return pending
}
