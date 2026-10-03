// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
import { renderToStaticMarkup } from 'react-dom/server'
import { CancellationPolicyView } from './CancellationPolicyView'
import { createPreviewCancellationPolicy } from '@/lib/publicCancellationPolicy'

describe('公開の規定の中止判定（空欄の行）', () => {
  it('空欄のまま保存された判定ルールは表示しない', () => {
    const base = createPreviewCancellationPolicy('queens-waltz')
    const policy = { ...base, is_configured: true, cancellation_notice_note: null, cancellation_judgment_rules: [{ id: 'x', timing: '', condition: '', result: '' }] }
    const html = renderToStaticMarkup(<CancellationPolicyView policy={policy} />)
    expect(html).not.toContain('中止判定のタイミング')
    expect(html).not.toContain(' → ')
  })

  it('記入済みのルールは表示する', () => {
    const base = createPreviewCancellationPolicy('queens-waltz')
    const policy = { ...base, is_configured: true, cancellation_judgment_rules: [{ id: 'y', timing: '前日 23:59', condition: '最低人数未満', result: '中止' }] }
    const html = renderToStaticMarkup(<CancellationPolicyView policy={policy} />)
    expect(html).toContain('中止判定のタイミング')
    expect(html).toContain('最低人数未満 → 中止')
  })
})

describe('公開の規定の中止判定（実際の判定の設定から作る、#714）', () => {
  it('判定の設定があれば、保存された文ではなく設定から作った文を出す', () => {
    const base = createPreviewCancellationPolicy('queens-waltz')
    const policy = {
      ...base, is_configured: true,
      cancellation_judgment_rules: [{ id: 'old', timing: '前日 23:59', condition: '古い文', result: '中止' }],
      judgment: { judgment_minutes: 240, extension_enabled: true, target_mode: 'percent', target_value: 50, extension_deadline_minutes: 90 },
    }
    const html = renderToStaticMarkup(<CancellationPolicyView policy={policy} />)
    expect(html).toContain('公演開始の4時間前（開催判断）')
    expect(html).toContain('公演開始の1時間30分前まで追加募集')
    expect(html).not.toContain('古い文')
  })
})
