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
