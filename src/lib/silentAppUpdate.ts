/**
 * 新しい版を検知したら、お知らせを出さずに自動で切り替える。
 *
 * このアプリは画面用の Service Worker を使っていない（プッシュ通知用の /sw.js だけ）。
 * 新しい版の検知は lazyWithRetry の initVersionCheck（index.html のハッシュ比較）で行い、
 * ここでは「いつ再読み込みしてよいか」だけを決める。
 *
 * - 次の画面遷移（pushState / 戻る・進む）のとき、遷移先の URL をそのまま読み込み直す
 * - タブが非表示から表示に戻ったとき、または検知した時点で、途中の入力が無ければ読み込み直す
 * - 途中の入力があるページ（予約・確認・貸切申込・プロフィール登録・グループ／チャット等）、
 *   値の入った入力欄、開いているダイアログがあるときは、その場では読み込み直さず次の遷移まで待つ
 */

/** その場では再読み込みしないページ（次の遷移まで待つ） */
const IN_PROGRESS_PATH_PATTERNS: RegExp[] = [
  /\/scenario(-detail)?\//, // 公演選択・予約確認（同じ URL のまま確認画面に切り替わる）
  /\/private-booking-(request|select)/,
  /\/complete-profile/,
  /\/signup/,
  /\/login/,
  /\/(reset|set)-password/,
  /\/group\//,
  /\/coupon-claim/,
  /\/mypage/,
]

/** 最後の操作からこの時間が経つまでは、即時の再読み込みをしない（押した直後に消えないように） */
const IDLE_MS = 10 * 1000

const TEXT_INPUT_TYPES = new Set(['', 'text', 'email', 'tel', 'number', 'url', 'password', 'search', 'date', 'time', 'datetime-local'])

export function isInProgressPath(pathname: string): boolean {
  return IN_PROGRESS_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
}

/** 値の入った入力欄・開いているダイアログがあるか */
export function hasUnsavedInput(root: ParentNode = document): boolean {
  if (root.querySelector('[role="dialog"], [role="alertdialog"]')) return true
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  for (const field of fields) {
    if (field.readOnly || field.disabled) continue
    if (field instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(field.type)) continue
    if (field.value.trim() !== '') return true
  }
  return Boolean(root.querySelector('[contenteditable="true"]:not(:empty)'))
}

const defaultLoader = {
  reload: () => window.location.reload(),
  assign: (url: string) => window.location.assign(url),
}
let loader = defaultLoader

let pending = false
let installed = false
let lastInteractionAt = 0

export function isUpdatePending(): boolean {
  return pending
}

function canReloadInPlace(): boolean {
  if (isInProgressPath(window.location.pathname)) return false
  if (hasUnsavedInput()) return false
  return Date.now() - lastInteractionAt >= IDLE_MS
}

function reloadNow(): void {
  pending = false
  loader.reload()
}

function tryReloadInPlace(): void {
  if (!pending || document.visibilityState !== 'visible') return
  if (canReloadInPlace()) reloadNow()
}

/** react-router が呼ぶ history.pushState を包み、遷移のタイミングで新しい版を読み込む */
function patchHistory(): void {
  const original = window.history.pushState.bind(window.history)
  window.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
    // location.state を使って画面間で値を渡す遷移は、読み込み直すと値が消えるので通常どおり進める
    const userState = (data as { usr?: unknown } | null)?.usr
    if (pending && url != null && (userState === undefined || userState === null)) {
      const next = new URL(String(url), window.location.href)
      if (next.origin === window.location.origin && next.pathname !== window.location.pathname) {
        pending = false
        loader.assign(next.toString())
        return
      }
    }
    original(data, unused, url)
  }

  window.addEventListener('popstate', () => {
    if (pending) reloadNow()
  })
}

/** 新しい版の検知時に呼ぶ */
export function markUpdateAvailable(): void {
  pending = true
  tryReloadInPlace()
}

/** 起動時に 1 回だけ呼ぶ */
export function installSilentAppUpdate(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  patchHistory()

  const markInteraction = () => {
    lastInteractionAt = Date.now()
  }
  window.addEventListener('pointerdown', markInteraction, { capture: true, passive: true })
  window.addEventListener('keydown', markInteraction, { capture: true, passive: true })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 戻ってきた直後は操作中ではないので、待ち時間を無視して判定する
      lastInteractionAt = 0
      tryReloadInPlace()
    }
  })

  // 何も触らずに開いているだけのページでも、操作が止まれば切り替える
  window.setInterval(tryReloadInPlace, IDLE_MS)
}

/** テスト用 */
export function __resetSilentAppUpdateForTest(testLoader?: typeof defaultLoader): void {
  pending = false
  lastInteractionAt = 0
  loader = testLoader ?? defaultLoader
}
