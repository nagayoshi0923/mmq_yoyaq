import { test, expect } from '@playwright/test'
test('中止前の確認で補償を選び、中止メールにまとめる', async ({ page }, testInfo) => {
  await page.goto('/e2e/fixtures/compensated-cancellation.html')
  await page.getByRole('button', { name: '次へ：メール送信の選択' }).click()
  await page.getByRole('checkbox', { name: 'GMの欠勤・体調不良による中止：お詫びクーポンを中止メールに含める' }).check()
  await expect(page.getByText('メール末尾に自動で追加される補償案内')).toBeVisible()
  await expect(page.getByText('確認用参加者：2名分')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '公演中止メールをメール対象全員に送信する（1件）' })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('combined-cancellation.png'), fullPage: true })
  await page.getByRole('button', { name: '中止を確定して補償付きメールを送る' }).click()
  await expect(page.getByRole('status')).toContainText('確定を受け付けました')
})
