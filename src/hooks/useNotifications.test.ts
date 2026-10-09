import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))

import { bellSeenAt, countNewNotifications, type Notification } from './useNotifications'

const n = (id: string, iso: string, read = false): Notification => ({
  id, type: 'system', title: id, message: '', timestamp: new Date(iso), read,
})

describe('ベルの数字（新着）', () => {
  const list = [
    n('a', '2026-10-09T10:00:00Z'),
    n('b', '2026-10-09T09:00:00Z'),
    n('c', '2026-10-09T08:00:00Z', true),
  ]

  it('開いた時刻が無い人は未読件数', () => {
    expect(countNewNotifications(list, null)).toBe(2)
  })

  it('開いた時刻より後に作られた通知だけ数える（既読かどうかは見ない）', () => {
    expect(countNewNotifications(list, new Date('2026-10-09T08:30:00Z'))).toBe(2)
    expect(countNewNotifications(list, new Date('2026-10-09T10:00:00Z'))).toBe(0)
    expect(countNewNotifications([n('d', '2026-10-09T11:00:00Z', true), ...list], new Date('2026-10-09T10:00:00Z'))).toBe(1)
  })
})

describe('ベルを開いた時刻', () => {
  it('ふだんは今', () => {
    const now = new Date('2026-10-09T12:00:00Z')
    expect(bellSeenAt([n('a', '2026-10-09T10:00:00Z')], now).toISOString()).toBe(now.toISOString())
  })

  it('端末の時計が遅れていても、見えている通知が新着に残らない', () => {
    const now = new Date('2026-10-09T09:58:00Z')
    expect(bellSeenAt([n('a', '2026-10-09T10:00:00Z')], now).toISOString()).toBe('2026-10-09T10:00:00.000Z')
  })

  it('先の予定（10 分より先）の時刻には合わせない', () => {
    const now = new Date('2026-10-09T09:00:00Z')
    expect(bellSeenAt([n('a', '2026-10-12T10:00:00Z')], now).toISOString()).toBe(now.toISOString())
  })
})
