import { describe, expect, it } from 'vitest'
import { storeBusinessHours } from '../../api/_lib/storeBusinessHours'
import { businessHoursSaveFields, normalizeBusinessHoursData } from './storeBusinessHours'

function database(options: { foreign?: boolean; updateError?: boolean; missing?: boolean } = {}) {
  const writes: { table: string; operation: string; value: unknown; filters: Record<string, unknown> }[] = []
  const reads: Record<string, unknown>[] = []
  return {
    writes, reads,
    from(table: string) {
      const filters: Record<string, unknown> = {}
      let operation = 'read'
      let value: unknown
      const chain = {
        select: () => chain,
        eq: (key: string, v: unknown) => { filters[key] = v; return chain },
        update: (v: unknown) => { operation = 'update'; value = v; return chain },
        insert: (v: unknown) => { operation = 'insert'; value = v; return chain },
        maybeSingle: async () => {
          reads.push(filters)
          return { data: table === 'stores' ? options.foreign ? null : { id: 'store' } : { id: 'hours' }, error: null }
        },
        then: (resolve: (v: unknown) => unknown) => {
          writes.push({ table, operation, value, filters })
          return Promise.resolve(resolve({ data: options.missing ? [] : [{ id: 'hours' }], error: options.updateError ? { message: 'offline' } : null }))
        },
      }
      return chain
    },
  }
}
const fields = () => businessHoursSaveFields(normalizeBusinessHoursData('store', null))
describe('店舗営業時間APIの組織境界', () => {
  it('別組織の店舗を読み書きしない', async () => {
    const db = database({ foreign: true })
    await expect(storeBusinessHours(db, 'org', 'store')).rejects.toMatchObject({ status: 404 })
    await expect(storeBusinessHours(db, 'org', 'store', fields())).rejects.toMatchObject({ status: 404 })
    expect(db.writes).toEqual([])
    expect(db.reads.every(read => read.organization_id === 'org')).toBe(true)
  })
  it('入力の組織・店舗IDを採用せず認証組織と検証店舗で保存する', async () => {
    const db = database({ missing: true })
    await storeBusinessHours(db, 'org', 'store', { ...fields(), organization_id: 'other', store_id: 'other', id: 'other' })
    expect(db.writes[0].filters).toEqual({ organization_id: 'org', store_id: 'store' })
    expect(db.writes[1].value).toMatchObject({ organization_id: 'org', store_id: 'store' })
    expect(db.writes[1].value).not.toHaveProperty('id')
  })
  it('更新失敗ではINSERTしない', async () => {
    const db = database({ updateError: true })
    await expect(storeBusinessHours(db, 'org', 'store', fields())).rejects.toMatchObject({ status: 500 })
    expect(db.writes.map(write => write.operation)).toEqual(['update'])
  })
  it('不明な組織や不正な設定を保存しない', async () => {
    const db = database()
    await expect(storeBusinessHours(db, null, 'store', fields())).rejects.toMatchObject({ status: 403 })
    await expect(storeBusinessHours(db, 'org', 'store', {})).rejects.toMatchObject({ status: 400 })
    expect(db.writes).toEqual([])
  })
  it('holidaysは任意入力でなく休業日から生成する', async () => {
    const db = database()
    await storeBusinessHours(db, 'org', 'store', { ...fields(), holidays: ['2099-01-01'], special_closed_days: [{ date: '2026-09-23', note: '点検' }] })
    expect(db.writes[0].value).toMatchObject({ holidays: ['2026-09-23'] })
  })
})
