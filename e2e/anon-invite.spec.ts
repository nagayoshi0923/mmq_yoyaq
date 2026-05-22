import { test, expect } from '@playwright/test'

/**
 * 未ログイン (anon) で貸切グループ招待ページが表示できることを確認する。
 *
 * 過去事故 (2026-05-22):
 *   Phase 2 RLS hardening (20260519040000) が anon 経路を壊し
 *   「招待が見つかりません: permission denied for table staff」表示で
 *   ゲストの入室が完全に止まった。
 *
 *   このテストはその種の RLS / GRANT 不整合による anon 入室の回帰を検出する。
 *
 * テストデータ:
 *   staging に存在する確認済み (status='confirmed' or 'date_adjusting') の
 *   private_groups.invite_code を1つ使用する。staging mirror で日次同期されるため
 *   通常は安定。コードが消えた場合は private_groups テーブルから別のコードを選ぶ。
 */

// staging に長期存在する招待コード (confirmed)
const STABLE_INVITE_CODE = 'SQZUM6PD'

test.describe('ゲスト招待ページ', () => {
  test('未ログインで招待ページが表示される（RLS/GRANT 不整合 401 検出）', async ({ page }) => {
    // コンソールの 401 / permission denied を捕捉してテスト失敗にする
    const consoleErrors: string[] = []
    page.on('console', msg => {
      const text = msg.text()
      if (msg.type() === 'error' && (text.includes('401') || text.includes('permission denied'))) {
        consoleErrors.push(text)
      }
    })
    page.on('response', resp => {
      if (resp.status() === 401 && resp.url().includes('supabase.co')) {
        consoleErrors.push(`HTTP 401: ${resp.url()}`)
      }
    })

    await page.goto(`/group/invite/${STABLE_INVITE_CODE}`)

    // 「招待が見つかりません」エラー画面が出ていないこと
    // (RLS / GRANT 不整合だとここに 401 を文字列化したものが入る)
    await expect(page.getByText('招待が見つかりません')).not.toBeVisible({ timeout: 15000 })

    // permission denied 文字列が画面に出ていないこと
    await expect(page.getByText(/permission denied/)).not.toBeVisible()

    // RLS / GRANT 不整合の console エラーが出ていないこと
    expect(consoleErrors, `anon クエリで 401 / permission denied を検出:\n${consoleErrors.join('\n')}`).toHaveLength(0)
  })
})
