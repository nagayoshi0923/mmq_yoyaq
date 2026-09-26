import { test, expect } from '@playwright/test'

test('特別営業日・旧休業日を表示し追加と保存後の再表示を確認する', async ({ page }) => {
  await page.goto('/e2e/fixtures/store-hours.html')
  await expect(page.getByText('臨時営業', { exact: false })).toBeVisible()
  await expect(page.getByText('2026-09-23', { exact: false })).toBeVisible()
  await page.locator('input[type="date"]').nth(1).fill('2026-09-24')
  await page.locator('input[placeholder]').last().fill('設備点検')
  await page.locator('section').last().getByRole('button').first().click()
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
