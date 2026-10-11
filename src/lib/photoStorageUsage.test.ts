import { describe, expect, it } from 'vitest'
import { formatBytes, photoStorageView, type PhotoStorageUsage } from './photoStorageUsage'

const GB = 1024 ** 3
const usage = (over: Partial<PhotoStorageUsage> = {}): PhotoStorageUsage => ({
  org_bytes: 1.5 * GB, org_month_bytes: 120 * 1024 ** 2, org_photo_count: 3400, org_month_photo_count: 210,
  total_bytes: 1.5 * GB, unknown_count: 0, month_start: '2026-09-30T15:00:00Z', warn_bytes: 50 * GB, ...over,
})

describe('チャット写真の容量の表示', () => {
  it('バイト数を読みやすく', () => {
    expect(formatBytes(0)).toBe('0 MB')
    expect(formatBytes(807565)).toBe('789 KB')
    expect(formatBytes(1.5 * GB)).toBe('1.5 GB')
    expect(formatBytes(120 * 1024 ** 2)).toBe('120 MB')
  })
  it('総容量・今月の増加量・枚数。50GB 以下は注意なし', () => {
    const v = photoStorageView(usage())
    expect(v.total).toBe('1.5 GB')
    expect(v.month).toBe('+120 MB')
    expect(v.count).toBe('3,400 枚（今月 +210 枚）')
    expect(v.warning).toBeNull()
    expect(v.siteTotal).toBeNull()
    expect(v.limit).toBe('50.0 GB')
  })
  it('サイト全体が 50GB を超えたら注意を出す', () => {
    const v = photoStorageView(usage({ total_bytes: 51 * GB }))
    expect(v.warning).toContain('50.0 GB を超えました')
    expect(v.warning).toContain('サイト全体 51.0 GB')
    expect(v.percent).toBe(100)
    expect(v.siteTotal).toBe('51.0 GB')
  })
})
