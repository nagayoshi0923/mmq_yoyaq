import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ from: vi.fn(), org: vi.fn(), sales: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }))
vi.mock('../../api/_lib/db.js', () => ({ db: { from: mock.from }, getMissingEnvError: () => null }))
vi.mock('../../api/_lib/auth.js', () => ({
  requireAuth: async () => ({ orgId: await mock.org(), role: 'admin' }),
  requireStaff: () => {}, ApiError: class extends Error {},
}))
vi.mock('@/lib/apiClient', () => ({ apiClient: { get: async (url: string) => {
  const { default: handler } = await import('../../api/sales')
  const params = Object.fromEntries(new URL(url, 'https://example.test').searchParams)
  let status = 200
  let body: any
  const res: any = { setHeader: () => {}, status: (code: number) => { status = code; return res }, json: (data: unknown) => { body = data; return res } }
  await handler({ method: 'GET', headers: {}, query: params } as any, res)
  if (status >= 400) throw new Error(body.error)
  return body
} } }))
vi.mock('@/lib/organization', () => ({ getCurrentOrganizationId: mock.org }))
vi.mock('@/hooks/useSalaryOrganization', () => ({ useSalaryOrganization: vi.fn() }))
vi.mock('@/lib/api', () => ({ salesApi: { getSalesByPeriod: mock.sales } }))
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { calculateGmWage, createSalarySettingsResolver, fetchSalarySettingsForDate, fetchSalarySettingsForPeriod, type SalarySettings } from './useSalarySettings'
import { fetchSalaryData } from '@/pages/SalaryCalculation/hooks/useSalaryData'
import { calculateSalesData, fetchSalesDataForPeriod } from '@/pages/SalesManagement/hooks/useSalesData'

const old: SalarySettings = {
  effective_from: '2020-01-01', gm_base_pay: 1000, gm_hourly_rate: 1000,
  gm_test_base_pay: 0, gm_test_hourly_rate: 500, reception_fixed_pay: 0,
  use_hourly_table: false, hourly_rates: [], gm_test_hourly_rates: [],
}
const newer: SalarySettings = { ...old, effective_from: '2020-01-16', gm_hourly_rate: 2000, reception_fixed_pay: 500 }

function query(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain: Record<string, any> = {}
  for (const method of ['select', 'eq', 'gt', 'gte', 'lte', 'order', 'limit', 'in', 'range']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.org.mockResolvedValue('org-a')
})

describe('公演日時点の報酬履歴', () => {
  it('期間前・変更当日・変更後を選び、未来の変更を遡及しない', () => {
    const resolve = createSalarySettingsResolver([newer, old, { ...old, effective_from: '2021-01-01', gm_base_pay: 9000 }])
    expect(calculateGmWage(180, false, resolve('2020-01-15'))).toBe(4000)
    expect(calculateGmWage(180, false, resolve('2020-01-16'))).toBe(7000)
    expect(calculateGmWage(180, true, resolve('2020-12-31'))).toBe(1500)
    expect(resolve('2020-01-01').reception_fixed_pay).toBe(0)
    expect(() => resolve('2019-12-31')).toThrow('履歴がありません')
  })

  it('時間別テーブルも当日の条件で計算し、明示された0円を保持する', () => {
    const resolve = createSalarySettingsResolver([old, { ...newer, use_hourly_table: true,
      hourly_rates: [{ hours: 3, amount: 8000 }], gm_test_hourly_rates: [{ hours: 3, amount: 0 }] }])
    expect(calculateGmWage(180, false, resolve('2020-01-16'))).toBe(8000)
    expect(calculateGmWage(180, true, resolve('2020-01-16'))).toBe(0)
  })

  it('不完全な履歴を初期値で埋めない', () => {
    const resolve = createSalarySettingsResolver([{ ...old, gm_base_pay: null } as unknown as SalarySettings])
    expect(() => resolve('2020-01-01')).toThrow('不完全')
  })

  it('組織を指定し、期間前の1件と期間内変更だけをまとめて取得する', async () => {
    mock.org.mockResolvedValue('org-b')
    const before = query(old)
    const changes = query([newer])
    mock.from.mockReturnValueOnce(before).mockReturnValueOnce(changes)
    const resolve = await fetchSalarySettingsForPeriod('2020-01-10', '2020-01-31', 'org-b')
    expect(before.eq).toHaveBeenCalledWith('organization_id', 'org-b')
    expect(changes.eq).toHaveBeenCalledWith('organization_id', 'org-b')
    expect(before.lte).toHaveBeenCalledWith('effective_from', '2020-01-10')
    expect(changes.gt).toHaveBeenCalledWith('effective_from', '2020-01-10')
    expect(changes.lte).toHaveBeenCalledWith('effective_from', '2020-01-31')
    expect(resolve('2020-01-10')).toEqual(old)
    expect(resolve('2020-01-16')).toEqual(newer)
    expect(mock.from).toHaveBeenCalledTimes(2)
    expect(mock.from.mock.calls.every(([table]) => table === 'salary_settings_history')).toBe(true)
  })

  it('履歴のページ上限を超えた変更も取得する', async () => {
    const first = query(Array(500).fill(old))
    const second = query([newer])
    mock.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(first).mockReturnValueOnce(second)
    const resolve = await fetchSalarySettingsForPeriod('2019-01-01', '2020-12-31', 'org-a')
    expect(second.range).toHaveBeenCalledWith(500, 999)
    expect(resolve('2020-01-16')).toEqual(newer)
  })

  it('履歴なしと取得失敗を区別し、現在設定にフォールバックしない', async () => {
    mock.from.mockReturnValue(query(null))
    await expect(fetchSalarySettingsForDate('2019-01-01')).rejects.toThrow('履歴がありません')
    mock.from.mockReturnValue(query(null, { message: 'offline' }))
    await expect(fetchSalarySettingsForDate('2020-01-01')).rejects.toThrow('履歴を取得できません')
    expect(mock.from.mock.calls.every(([table]) => table === 'salary_settings_history')).toBe(true)
  })

  it('組織不明時はデータを取得しない', async () => {
    mock.org.mockResolvedValue(null)
    await expect(fetchSalarySettingsForDate('2020-01-01')).rejects.toThrow('組織')
    expect(mock.from).not.toHaveBeenCalled()
  })
})

const stores = [{ id: 'store-a', name: '店舗', short_name: '店' }]
const dates = ['2020-01-15', '2020-01-16']
const events = dates.map((date, index) => ({
  id: `event-${index}`, date, store_id: 'store-a', scenario: '作品', category: 'open',
  gms: ['メイン', 'サブ', '受付', '参加', '見学'],
  gm_roles: { メイン: 'main', サブ: 'sub', 受付: 'reception', 参加: 'staff', 見学: 'observer' },
  scenarios: { duration: 180 }, scenario_masters: { title: '作品', official_duration: 180 },
  stores: { name: '店舗' }, is_cancelled: false,
}))
const sales = (rows: typeof events, resolve = createSalarySettingsResolver([old, newer])) => calculateSalesData(
  rows, stores, new Date('2020-01-01T00:00:00+09:00'), new Date('2020-01-31T23:59:59+09:00'), [], resolve, new Map(),
)

describe('給与・売上の回帰', () => {
  it('月途中の変更と役割を給与合計・売上合計・公演明細で共通適用する', async () => {
    const staff = query(events[0].gms.map((name, i) => ({ id: `${i}`, name, role: ['gm'] })))
    const performances = query(events)
    mock.from.mockImplementation(table => {
      if (table === 'salary_settings_history') return query(tableCalls++ === 0 ? old : [newer])
      return table === 'staff' ? staff : performances
    })
    let tableCalls = 0
    const salary = await fetchSalaryData(2020, 1, [], 'org-a')
    const report = sales(events)
    expect(salary.totalAmount).toBe(22500)
    expect(report.totalGmCost).toBe(salary.totalAmount)
    expect(report.eventList?.map(event => event.gm_cost)).toEqual([8000, 14500])
    expect(performances.eq).toHaveBeenCalledWith('organization_id', 'org-a')
  })

  it('GMテストを通常給与で計算しない', () => {
    expect(sales(events.map(event => ({ ...event, category: 'gmtest' }))).totalGmCost).toBe(6500)
  })

  it('公演の明示報酬がある場合は履歴で上書きしない', () => {
    const rows = events.map(event => ({ ...event, gms: ['メイン'],
      scenarios: { duration: 180, gm_costs: [{ role: 'main', reward: 1234 }] } }))
    const resolve = vi.fn(() => { throw new Error('履歴不要') })
    expect(sales(rows, resolve).eventList?.map(event => event.gm_cost)).toEqual([1234, 1234])
    expect(resolve).not.toHaveBeenCalled()
  })

  it('中止公演と無報酬の役割は履歴欠落でも0円とする', async () => {
    const staff = events[0].gms.map((name, i) => ({ id: `${i}`, name, role: ['gm'] }))
    mock.from.mockImplementation(table => query(table === 'staff' ? staff : table === 'salary_settings_history' ? null : [
      { ...events[0], is_cancelled: true }, { ...events[1], gms: ['参加', '見学'] },
    ]))
    expect((await fetchSalaryData(2020, 1, [])).totalAmount).toBe(0)
    const resolve = vi.fn(() => { throw new Error('履歴不要') })
    expect(sales(events.map(event => ({ ...event, gms: ['参加', '見学'] })), resolve).totalGmCost).toBe(0)
    expect(resolve).not.toHaveBeenCalled()
  })

  it('給与と売上は必要な履歴欠落を計算エラーにする', async () => {
    mock.from.mockImplementation(table => query(table === 'staff'
      ? events[0].gms.map((name, i) => ({ id: `${i}`, name, role: ['gm'] }))
      : table === 'salary_settings_history' ? null : events))
    await expect(fetchSalaryData(2020, 1, [])).rejects.toThrow('履歴がありません')
    expect(() => sales(events, createSalarySettingsResolver([]))).toThrow('履歴がありません')
  })

  it('売上チャート用の拡張期間を含めて履歴を取得する', async () => {
    const histories: ReturnType<typeof query>[] = []
    mock.sales.mockResolvedValue([])
    mock.from.mockImplementation(table => {
      const q = query(table === 'salary_settings_history' ? null : [])
      if (table === 'salary_settings_history') histories.push(q)
      return q
    })
    await fetchSalesDataForPeriod('2020-01-01', '2020-03-31', [], undefined, stores, 'org-a')
    const [, actualEnd] = mock.sales.mock.calls[0]
    expect(histories[1].lte).toHaveBeenCalledWith('effective_from', actualEnd)
  })

  it('切替前の組織のクエリに切替後のデータを格納しない', async () => {
    await expect(fetchSalaryData(2020, 1, [], 'org-b')).rejects.toThrow('組織')
    await expect(fetchSalesDataForPeriod('2020-01-01', '2020-01-31', [], undefined, stores, 'org-b')).rejects.toThrow('組織')
    expect(mock.from).not.toHaveBeenCalled()
  })
})
