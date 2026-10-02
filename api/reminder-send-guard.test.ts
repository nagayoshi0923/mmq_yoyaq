import { describe, expect, it, vi } from 'vitest'
import { isScheduledReminderCurrent } from '../supabase/functions/_shared/reminder-send-guard'

const params = { organizationId: 'org', reservationId: 'reservation', scheduleEventId: 'event' }

function setup(overrides: Record<string, unknown> = {}) {
  const rows: Record<string, unknown> = {
    reservations: { status: 'confirmed', schedule_event_id: 'event' },
    schedule_events: { is_cancelled: false },
    ...overrides,
  }
  const filters: [string, string, unknown][] = []
  const db = {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key: string, value: unknown) => {
          filters.push([table, key, value])
          return query
        }),
        maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })),
      }
      return query
    }),
  }
  return { db, filters }
}

describe('自動リマインドの送信直前確認', () => {
  it('有効な予約と未中止公演だけ送る', async () => {
    const { db, filters } = setup()
    expect(await isScheduledReminderCurrent(db, params)).toBe(true)
    expect(filters.filter(([, key]) => key === 'organization_id')).toHaveLength(2)
    expect(filters.every(([, key, value]) => key !== 'organization_id' || value === 'org')).toBe(true)
  })

  it.each(['cancelled', 'checked_in', 'completed'])('予約が%sなら送らない', async (status) => {
    expect(await isScheduledReminderCurrent(setup({
      reservations: { status, schedule_event_id: 'event' },
    }).db, params)).toBe(false)
  })

  it.each([
    { reservations: { status: 'confirmed', schedule_event_id: 'other' } },
    { schedule_events: { is_cancelled: true } },
    { schedule_events: null },
    { reservations: null },
  ])('振替・中止・削除・参照消失後は送らない', async (change) => {
    expect(await isScheduledReminderCurrent(setup(change).db, params)).toBe(false)
  })

  it('DBエラーは期限切れと決めつけず再試行へ渡す', async () => {
    const error = new Error('read failed')
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error }) }
    await expect(isScheduledReminderCurrent({ from: () => q }, params)).rejects.toBe(error)
  })
})
