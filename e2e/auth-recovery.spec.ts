import { test, expect, type BrowserContext } from '@playwright/test'

// 新しい一時contextだけを使用。Supabase/外部通信はすべてfixtureで受け、実アカウントを使わない。
test.use({ serviceWorkers: 'block' })

const UID = '00000000-0000-4000-a000-000000000001'
async function isolate(context: BrowserContext, oauth = false) {
  let readable = false
  const authWrites: string[] = []
  const customerChecks: string[] = []
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: UID, exp: 4102444800, role: 'authenticated' })).toString('base64url')}.fixture`
  const user = { id: UID, aud: 'authenticated', email: 'fixture@example.invalid', app_metadata: { provider: oauth ? 'google' : 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  await context.addInitScript(({ token, user, oauth }) => {
    if (oauth) { sessionStorage.setItem('oauth_mode', 'login'); sessionStorage.setItem('returnUrl', '/faq?from=booking') }
    if (!oauth && !localStorage.getItem('mmq-supabase-auth')) localStorage.setItem('mmq-supabase-auth', JSON.stringify({ access_token: token, refresh_token: 'fixture-only', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user }))
  }, { token, user, oauth })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')) {
      if (route.request().method() !== 'GET' && route.request().method() !== 'OPTIONS') authWrites.push(url.pathname)
      if (url.pathname === '/rest/v1/customers' && url.searchParams.get('select') === 'id') customerChecks.push(url.pathname)
      const roleRead = url.pathname === '/rest/v1/users'
      return route.fulfill({ status: roleRead && !readable ? 503 : 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, contentType: 'application/json', body: JSON.stringify(roleRead ? readable ? { id: UID, role: 'customer', is_store_representative: false } : { message: 'fixture offline' } : url.pathname.endsWith('/user') ? user : url.pathname === '/rest/v1/customers' ? [{ id: UID }] : []) })
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"isolated fixture"}' })
    if (url.origin === 'http://localhost:5173' || url.origin === 'http://127.0.0.1:5173') return route.continue()
    return route.abort() // メール/診断/実サービスを含め、ほかの外部通信は送らない
  })
  return { recover: () => { readable = true }, authWrites, token, customerChecks }
}

test('保存セッションの情報取得失敗を明示し、再認証なしで再試行できる', async ({ context, page }) => {
  const fixture = await isolate(context)
  await page.goto('/login?redirect=%2Ffaq')
  const notice = page.getByRole('alert', { name: 'ログイン情報の確認エラー' })
  await expect(notice).toBeVisible({ timeout: 15_000 })
  await expect(notice.getByRole('link', { name: 'ログイン画面へ' })).toHaveAttribute('href', '/login?redirect=%2Ffaq')
  fixture.recover()
  await notice.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(notice).toHaveCount(0)
  expect(fixture.authWrites).not.toContain('/auth/v1/token')
  expect(fixture.authWrites).not.toContain('/auth/v1/logout')
})

test('別タブが共有WebLockを保持しても有限時間で警告し、解放後は回復する', async ({ context, page }) => {
  test.setTimeout(40_000)
  const fixture = await isolate(context); fixture.recover()
  await page.goto('/login')
  await page.evaluate(() => {
    const state = window as typeof window & { held?: boolean; releaseFixtureLock?: () => void }
    void navigator.locks.request('lock:mmq-supabase-auth', async () => {
      state.held = true
      await new Promise<void>(resolve => { state.releaseFixtureLock = resolve })
    })
  })
  await expect.poll(() => page.evaluate(() => (window as typeof window & { held?: boolean }).held)).toBe(true)
  const second = await context.newPage()
  await second.goto('/login')
  const notice = second.getByRole('alert', { name: 'ログイン情報の確認エラー' })
  await expect(notice).toBeVisible({ timeout: 15_000 })
  await page.evaluate(() => (window as typeof window & { releaseFixtureLock?: () => void }).releaseFixtureLock?.())
  await expect(notice).toHaveCount(0, { timeout: 10_000 })
  expect(fixture.authWrites).not.toContain('/auth/v1/logout')
})


for (const callback of ['/login', '/faq?from=booking', '/login?redirect=%2Ffaq%3Ffrom%3Dbooking']) {
test(`OAuth復帰${callback}から再試行し、顧客確認後に戻り先へ完了する`, async ({ context, page }) => {
  const fixture = await isolate(context, true)
  // LoginFormのredirectTo契約：戻り先URL自体にOAuthハッシュが付いて戻る。
  await page.goto(`${callback}#access_token=${fixture.token}&refresh_token=fixture-only&expires_in=3600&token_type=bearer`)
  const notice = page.getByRole('alert', { name: 'ログイン情報の確認エラー' })
  await expect(notice).toBeVisible({ timeout: 15_000 })
  fixture.recover()
  await notice.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await expect(page).toHaveURL(/\/faq\?from=booking$/)
  await expect.poll(() => fixture.customerChecks.length).toBeGreaterThan(0)
  expect(fixture.authWrites).not.toContain('/auth/v1/token')
  expect(fixture.authWrites).not.toContain('/auth/v1/logout')
})

}
