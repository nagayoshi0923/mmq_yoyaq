import { test, expect } from '@playwright/test'

test('特別営業日・旧休業日を表示し追加と保存後の再表示を確認する', async ({ page }) => {
  await page.goto('/e2e/fixtures/store-hours.html')
  await expect(page.getByText('臨時営業', { exact: false })).toBeVisible()
  await expect(page.getByText('2026-09-23', { exact: false })).toBeVisible()
  const closedDays = page.locator('section', { hasText: '特別休業日' })
  await closedDays.locator('input[type="date"]').fill('2026-09-24')
  await closedDays.getByPlaceholder('備考（例：店舗メンテナンス）').fill('設備点検')
  await closedDays.getByRole('button').first().click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-saved') || '{}')).toMatchObject({
    holidays: ['2026-09-23', '2026-09-24'], special_open_days: [{ date: '2026-09-22', note: '臨時営業' }],
    special_closed_days: [{ date: '2026-09-23', note: '' }, { date: '2026-09-24', note: '設備点検' }],
  })
  await page.reload()
  await expect(page.getByText('設備点検', { exact: false })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('取得失敗で初期値を保存できない', async ({ page }) => {
  await page.goto('/e2e/fixtures/store-hours.html?failure=read')
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await expect(page.locator('html')).not.toHaveAttribute('data-saved')
})

test('更新失敗を新規作成へ誤って切り替えない', async ({ page }) => {
  await page.goto('/e2e/fixtures/store-hours.html?failure=write')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-inserted', 'false')
  await expect(page.locator('html')).not.toHaveAttribute('data-saved')
})

test('募集停止期間を追加・全日程で追加・削除でき、再表示でも残る', async ({ page }) => {
  await page.goto('/e2e/fixtures/store-hours.html')
  const pause = page.locator('section', { hasText: '募集停止' }).last()
  await expect(pause.getByText('公演募集停止')).toBeVisible()
  await pause.locator('#pause-private-start').fill('2026-12-01')
  await pause.locator('#pause-private-end').fill('2026-12-03')
  await pause.getByRole('button', { name: '期間を追加' }).nth(1).click()
  await expect(pause.getByText('2026-12-01 〜 2026-12-03')).toBeVisible()
  await pause.getByRole('button', { name: '全日程で追加' }).first().click()
  await expect(pause.getByText('全日程', { exact: true })).toBeVisible()
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-pauses') || '[]')).toMatchObject([
    { pause_type: 'private', starts_on: '2026-12-01', ends_on: '2026-12-03' },
    { pause_type: 'performance', starts_on: null, ends_on: null },
  ])
  await page.reload()
  await expect(pause.getByText('2026-12-01 〜 2026-12-03')).toBeVisible()
  await pause.getByRole('button', { name: /貸切募集停止.*削除/ }).click()
  await expect(pause.getByText('2026-12-01 〜 2026-12-03')).toHaveCount(0)
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
