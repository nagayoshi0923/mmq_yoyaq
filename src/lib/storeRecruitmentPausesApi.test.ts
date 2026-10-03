import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addStoreRecruitmentPause, listStoreRecruitmentPauses, removeStoreRecruitmentPause } from '../../api/_lib/storeRecruitmentPauses'

function database(options: { foreign?: boolean; deleted?: number } = {}) {
  const calls: { table: string; operation: string; value?: unknown; filters: Record<string, unknown> }[] = []
  const fake = {
    calls,
    from(table: string) {
      const entry = { table, operation: 'read', value: undefined as unknown, filters: {} as Record<string, unknown> }
      const chain = {
        select: () => chain,
        order: () => chain,
        eq: (key: string, v: unknown) => { entry.filters[key] = v; return chain },
        insert: (v: unknown) => { entry.operation = 'insert'; entry.value = v; return chain },
        delete: () => { entry.operation = 'delete'; return chain },
        maybeSingle: async () => {
          calls.push(entry)
          if (table === 'stores') return { data: options.foreign ? null : { id: 'store' }, error: null }
          return { data: { id: 'pause', ...(entry.value as object) }, error: null }
        },
        then: (resolve: (v: unknown) => unknown) => {
          calls.push(entry)
          const data = entry.operation === 'delete' ? Array.from({ length: options.deleted ?? 1 }, () => ({ id: 'pause' })) : [{ id: 'pause' }]
          return Promise.resolve(resolve({ data, error: null }))
        },
      }
      return chain
    },
  }
  // 本物の Supabase クライアントの代わりに渡す（使う問い合わせだけを真似る）
  return fake as typeof fake & SupabaseClient
}

describe('店舗の募集停止期間APIの組織境界', () => {
  it('他組織の店舗は読み書きできず、停止期間の表に触らない', async () => {
    const db = database({ foreign: true })
    await expect(listStoreRecruitmentPauses(db, 'org', 'store')).rejects.toMatchObject({ status: 404 })
    await expect(addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'private' })).rejects.toMatchObject({ status: 404 })
    await expect(removeStoreRecruitmentPause(db, 'org', 'store', 'pause')).rejects.toMatchObject({ status: 404 })
    expect(db.calls.filter(c => c.table === 'store_recruitment_pauses')).toEqual([])
    expect(db.calls.every(c => c.filters.organization_id === 'org')).toBe(true)
  })

  it('組織が分からなければ拒否する', async () => {
    await expect(listStoreRecruitmentPauses(database(), null, 'store')).rejects.toMatchObject({ status: 403 })
  })

  it('追加は入力の組織IDではなくログイン中の組織で保存する', async () => {
    const db = database()
    await addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'private', starts_on: '2026-12-01', ends_on: '2026-12-03', organization_id: 'evil' })
    const insert = db.calls.find(c => c.operation === 'insert')
    expect(insert?.value).toEqual({ organization_id: 'org', store_id: 'store', pause_type: 'private', starts_on: '2026-12-01', ends_on: '2026-12-03' })
  })

  it('全日程（開始・終了なし）を許し、不正な種類・日付・逆順は拒否する', async () => {
    const db = database()
    await expect(addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'performance' })).resolves.toBeTruthy()
    await expect(addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'other' })).rejects.toMatchObject({ status: 400 })
    await expect(addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'private', starts_on: '12/01' })).rejects.toMatchObject({ status: 400 })
    await expect(addStoreRecruitmentPause(db, 'org', 'store', { pause_type: 'private', starts_on: '2026-12-05', ends_on: '2026-12-01' })).rejects.toMatchObject({ status: 400 })
  })

  it('削除は組織・店舗・期間IDで絞り、該当なしは404', async () => {
    const db = database()
    await removeStoreRecruitmentPause(db, 'org', 'store', 'pause')
    const del = db.calls.find(c => c.operation === 'delete')
    expect(del?.filters).toEqual({ id: 'pause', store_id: 'store', organization_id: 'org' })
    await expect(removeStoreRecruitmentPause(database({ deleted: 0 }), 'org', 'store', 'pause')).rejects.toMatchObject({ status: 404 })
  })

  it('店舗IDなしは自組織の全店舗分だけを返す', async () => {
    const db = database()
    await listStoreRecruitmentPauses(db, 'org', undefined)
    expect(db.calls).toHaveLength(1)
    expect(db.calls[0]).toMatchObject({ table: 'store_recruitment_pauses', filters: { organization_id: 'org' } })
    await expect(listStoreRecruitmentPauses(db, null, undefined)).rejects.toMatchObject({ status: 403 })
  })
})
