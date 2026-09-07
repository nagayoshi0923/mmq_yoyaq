import { test, expect } from '@playwright/test'
const event = { scenario: '追加募集の確認用公演', date: '2026-09-07', start_time: '19:00:00', store_name: '確認用店舗', deadline: '2026-09-07T08:30:00Z' }
test('無料辞退は専用ページの確認後だけ実行される', async ({ page }) => {
  let withdrawn = false
  await page.route('**/api/recruitment', async route => {
    const body = route.request().postDataJSON()
    if (body.action === 'withdraw') withdrawn = true
    await route.fulfill({ json: { success: true, status: withdrawn ? 'withdrawn' : 'active', can_withdraw: !withdrawn, participant_count: withdrawn ? 0 : 1, event } })
  })
  await page.goto('/recruitment-response#00000000-0000-4000-8000-000000000001')
  await expect(page.getByRole('heading', { name: event.scenario })).toBeVisible()
  expect(withdrawn).toBe(false)
  await expect(page.getByText(/17:30/)).toBeVisible()
  await page.getByRole('button', { name: '内容を確認する', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(withdrawn).toBe(false)
  await page.getByRole('dialog').getByRole('button', { name: '無料で参加を取りやめる' }).click()
  await expect(page.getByRole('status')).toContainText('キャンセル料は0円')
  expect(withdrawn).toBe(true)
})
test('期限切れ・無効リンクから辞退できない', async ({ page }) => {
  await page.route('**/api/recruitment', route => route.fulfill({ status: 404, json: { success: false, error: 'INVALID_LINK' } }))
  await page.goto('/recruitment-response#invalid')
  await expect(page.getByRole('alert')).toContainText('専用リンク')
  await expect(page.getByRole('button', { name: '無料で参加を取りやめる' })).toHaveCount(0)
})

test('3名から1名だけ辞退すると2名の予約を維持する', async ({ page }) => {
  let remaining = 3
  await page.route('**/api/recruitment', async route => {
    const body = route.request().postDataJSON()
    if (body.action === 'withdraw') {
      expect(body.count).toBe(1)
      expect(body.expected_count).toBe(3)
      expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/)
      remaining = 2
    }
    await route.fulfill({ json: { success: true, status: 'active', can_withdraw: true, participant_count: remaining, withdrawn_count: remaining === 2 ? 1 : undefined, event } })
  })
  await page.goto('/recruitment-response#00000000-0000-4000-8000-000000000001')
  await page.getByRole('button', { name: '内容を確認する' }).click()
  await expect(page.getByRole('dialog')).toContainText('残り2名')
  await page.getByRole('dialog').getByRole('button', { name: '無料で参加を取りやめる' }).click()
  await expect(page.getByRole('status')).toContainText('残り2名の予約は維持')
})
