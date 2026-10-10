/*
 * MMQ のサービスワーカー（貸切グループのプッシュ通知だけ。段階 3、2026-10-10）。
 * 画面のファイルは一切キャッシュしない（fetch を扱わない）。古い PWA のキャッシュで画面が古くなる問題を繰り返さないため。
 * 届いた通知を出し、押されたらそのグループのチャット（/group/invite/{code}?tab=chat など）を開く。
 */
self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = typeof data.title === 'string' && data.title ? data.title : 'MMQ'
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/mypage'
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    renotify: Boolean(data.tag),
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = (event.notification.data && event.notification.data.url) || '/mypage'
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // 同じグループを開いているタブがあれば、それを前に出して移す
    const samePage = windows.find(w => new URL(w.url).pathname === new URL(target).pathname)
    if (samePage) {
      await samePage.focus().catch(() => undefined)
      if ('navigate' in samePage && samePage.url !== target) await samePage.navigate(target).catch(() => undefined)
      return
    }
    // 同じグループのタブが無ければ新しく開く（別の画面で操作中のタブは動かさない）
    await self.clients.openWindow(target)
  })())
})
