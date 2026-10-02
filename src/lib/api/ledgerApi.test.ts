import { beforeEach, describe, expect, it, vi } from 'vitest'

// supabase のチェーン（from → 操作 → 条件）を記録するモック
const m = vi.hoisted(() => {
  const calls: Array<[string, unknown[]]> = []
  const make = () => {
    const q: Record<string, unknown> = {}
    q.eq = (...a: unknown[]) => { calls.push(['eq', a]); return q }
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return q
  }
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return {
      insert: (...a: unknown[]) => { calls.push(['insert', a]); return make() },
      update: (...a: unknown[]) => { calls.push(['update', a]); return make() },
      upsert: (...a: unknown[]) => { calls.push(['upsert', a]); return make() },
      delete: () => { calls.push(['delete', []]); return make() },
    }
  })
  return { calls, from }
})
vi.mock('@/lib/supabase', () => ({ supabase: { from: m.from } }))
import { miscTransactionApi, externalSalesApi, salarySettingsApi, licenseReportHistoryApi } from './ledgerApi'

beforeEach(() => { m.calls.length = 0 })
const eqs = () => m.calls.filter(c => c[0] === 'eq').map(c => c[1])

describe('収支の台帳', () => {
  it('雑収入・制作費は配列で挿入し、更新・削除は id で絞る', async () => {
    await miscTransactionApi.create({ amount: 100 })
    expect(m.calls.slice(0, 2)).toEqual([['from', ['miscellaneous_transactions']], ['insert', [[{ amount: 100 }]]]])
    m.calls.length = 0
    await miscTransactionApi.update('t1', { amount: 200 })
    expect(m.calls[1]).toEqual(['update', [{ amount: 200 }]]); expect(eqs()).toEqual([['id', 't1']])
    m.calls.length = 0
    await miscTransactionApi.delete('t1')
    expect(m.calls[1][0]).toBe('delete'); expect(eqs()).toEqual([['id', 't1']])
  })
  it('外部売上も同じ形（external_sales）', async () => {
    await externalSalesApi.create({ amount: 1 })
    expect(m.calls.slice(0, 2)).toEqual([['from', ['external_sales']], ['insert', [[{ amount: 1 }]]]])
    m.calls.length = 0
    await externalSalesApi.update('e1', { amount: 2 }); await externalSalesApi.delete('e1')
    expect(eqs()).toEqual([['id', 'e1'], ['id', 'e1']])
  })
})

describe('給与設定', () => {
  const values = { gm_base_pay: 2000, gm_hourly_rate: 1000, gm_test_base_pay: 1500, gm_test_hourly_rate: 800, reception_fixed_pay: 1000, use_hourly_table: false, hourly_rates: [], gm_test_hourly_rates: [] }
  it('現在値は id と組織で絞って更新する', async () => {
    await salarySettingsApi.updateCurrent('g1', 'o1', values)
    expect(m.calls.slice(0, 2)).toEqual([['from', ['global_settings']], ['update', [values]]]); expect(eqs()).toEqual([['id', 'g1'], ['organization_id', 'o1']])
  })
  it('履歴は有効開始日つきで upsert し、同じ日の再保存は上書き', async () => {
    await salarySettingsApi.saveHistory('o1', '2026-10-02', values)
    expect(m.calls[0]).toEqual(['from', ['salary_settings_history']])
    expect(m.calls[1][1]).toEqual([{ organization_id: 'o1', effective_from: '2026-10-02', ...values }, { onConflict: 'organization_id,effective_from' }])
  })
})

describe('ライセンス報告の送信履歴', () => {
  it('保存は同じ組織・作者・年月を上書き', async () => {
    const row = { organization_id: 'o1', author_name: 'A', author_email: null, year: 2026, month: 9, total_events: 1, total_license_cost: 100, email_body: 'b', subject: 's', scenarios: [] }
    await licenseReportHistoryApi.save(row)
    expect(m.calls[0]).toEqual(['from', ['license_report_history']]); expect(m.calls[1][1]).toEqual([row, { onConflict: 'organization_id,author_name,year,month' }])
  })
  it('本文の編集は組織・作者・年・月で絞って更新', async () => {
    await licenseReportHistoryApi.updateBody('o1', 'A', 2026, 9, { email_body: 'b', subject: 's' })
    expect(m.calls[1]).toEqual(['update', [{ email_body: 'b', subject: 's' }]]); expect(eqs()).toEqual([['organization_id', 'o1'], ['author_name', 'A'], ['year', 2026], ['month', 9]])
  })
})
