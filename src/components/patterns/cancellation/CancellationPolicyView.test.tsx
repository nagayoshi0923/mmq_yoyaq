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

  it('一部の欄だけ書いたルールは消さずに表示する（#866）', () => {
    const base = createPreviewCancellationPolicy('queens-waltz')
    const policy = { ...base, is_configured: true, cancellation_judgment_rules: [{ id: 'z', timing: '前日 23:59', condition: '最低人数未満', result: '' }] }
    const html = renderToStaticMarkup(<CancellationPolicyView policy={policy} />)
    expect(html).toContain('前日 23:59')
    expect(html).toContain('最低人数未満')
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

describe('同じ規定の店舗をまとめる（点検 21）', () => {
  it('内容が同じ店舗は 1 つにまとめ、違う店舗だけ別に出す', async () => {
    const { groupPoliciesByContent } = await import('@/lib/cancellationPolicyGroups')
    const base = createPreviewCancellationPolicy('queens-waltz')
    const a = { ...base, store_id: 'a', store_name: 'フォレスト①', policy_updated_at: '2026-09-01' }
    const b = { ...base, store_id: 'b', store_name: '高田馬場店', policy_updated_at: '2026-10-01' }
    const c = { ...base, store_id: 'c', store_name: '大久保店', cancellation_deadline_hours: 72 }
    const groups = groupPoliciesByContent([a, b, c])
    expect(groups).toHaveLength(2)
    expect(groups[0].storeNames).toEqual(['フォレスト①', '高田馬場店'])
    expect(groups[0].policy.policy_updated_at).toBe('2026-10-01')
    expect(groups[1].storeNames).toEqual(['大久保店'])
    const html = renderToStaticMarkup(<CancellationPolicyView policy={groups[0].policy} storeNames={groups[0].storeNames} />)
    expect(html).toContain('対象店舗（2店舗）')
    expect(html).toContain('フォレスト①、高田馬場店')
  })
})
