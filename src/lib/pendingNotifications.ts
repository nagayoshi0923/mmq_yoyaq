/**
 * 保存は済んだが、確認メールなどの送信がまだ終わっていない間だけ、
 * タブを閉じようとしたときにブラウザの「このサイトを離れますか？」を出す。
 * 画面は保存直後に完了表示へ進め（点検 36: 待ち時間の短縮）、送信は裏で続ける。
 */
let pending = 0

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  // 古いブラウザ向け（文言は表示されない）
  event.returnValue = ''
}

export function trackPendingNotification<T>(work: Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return work
  pending += 1
  if (pending === 1) window.addEventListener('beforeunload', onBeforeUnload)
  const done = () => {
    pending = Math.max(0, pending - 1)
    if (pending === 0) window.removeEventListener('beforeunload', onBeforeUnload)
  }
  work.then(done, done)
  return work
}

export function pendingNotificationCount(): number {
  return pending
}
