import { test, expect } from '@playwright/test'
test('貸切リマインドの編集がオープン文面に影響しない', async ({ page }) => {
  await page.goto('/e2e/fixtures/reminder-settings.html')
  await page.getByRole('button', { name: 'オープン公演リマインドメール' }).click()
  await page.getByRole('button', { name: '貸切公演リマインドメール' }).click()
  await page.locator('textarea').filter({ hasText: '貸切専用の案内' }).fill('貸切だけ編集した案内')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => JSON.parse(await page.locator('html').getAttribute('data-saved') || '{}')).toMatchObject({
    reminder_template: 'オープン専用の案内', private_reminder_template: '貸切だけ編集した案内'
  })
  await page.setViewportSize({ width: 375, height: 812 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
