import { test, expect } from '@playwright/test'

/**
 * ログイン・新規登録の戻り先（点検 2026-10-11 の 1・3・11・25）
 *
 * Supabase には接続しない（認証の通信は page.route で受ける）。
 * - 新規登録の確認メールのリンク（emailRedirectTo）に、選んでいた公演への戻り先（?next=）が載る
 * - ログイン・新規登録画面に「元の画面に戻る」「この後の流れ」が出る
 * - 確認メールのリンクが期限切れのときは再送を案内し、「同じブラウザで開く」とは言わない
 */

const BOOKING_RETURN = '/queens-waltz/scenario/usagi?event=00000000-0000-4000-e000-000000000005&count=3'

test.describe('ログイン・新規登録の戻り先', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('ログイン画面は戻り先があると「元の画面に戻ります」と出す', async ({ page }) => {
    await page.goto(`/login?redirect=${encodeURIComponent(BOOKING_RETURN)}`)
    await expect(page.getByText('ログインすると、元の画面に戻ります。')).toBeVisible({ timeout: 15000 })
  })

  test('新規登録は「この後の流れ」を出し、同意は最後の入力画面で 1 回だけ', async ({ page }) => {
    await page.goto(`/signup?redirect=${encodeURIComponent(BOOKING_RETURN)}`)
    await expect(page.getByText(/この後の流れ: メールが届く/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('登録が終わると、元の画面に戻ります。')).toBeVisible()
    await expect(page.getByText(/同意したものとみなされます/)).toHaveCount(0)
  })

  test('確認メールのリンクに戻り先（next）を載せる', async ({ page }) => {
    await page.route('**/rest/v1/rpc/check_email_registration_status**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('not_registered') }),
    )
    let otpUrl = ''
    await page.route('**/auth/v1/otp**', (route) => {
      otpUrl = route.request().url()
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto(`/signup?redirect=${encodeURIComponent(BOOKING_RETURN)}`)
    await page.locator('#email').fill('new-customer@example.invalid')
    await page.getByRole('button', { name: 'アカウント作成' }).click()
    await expect(page.getByText(/確認メールを送信しました/)).toBeVisible({ timeout: 15000 })

    const redirectTo = new URL(otpUrl).searchParams.get('redirect_to') ?? ''
    const target = new URL(redirectTo)
    expect(target.pathname).toBe('/complete-profile')
    expect(target.searchParams.get('next')).toBe(BOOKING_RETURN)
  })

  test('確認メールのリンクが期限切れなら再送を案内する（同じブラウザの案内はしない）', async ({ page }) => {
    await page.goto(
      `/complete-profile?next=${encodeURIComponent(BOOKING_RETURN)}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    )
    await expect(page.getByText('リンクの期限が切れました')).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'もう一度メールを送る' })).toBeVisible()
    await expect(page.getByText(/同じブラウザ/)).toHaveCount(0)
  })
})
