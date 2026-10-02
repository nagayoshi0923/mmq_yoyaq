import { beforeEach, describe, expect, it, vi } from 'vitest'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../supabase/functions/_shared/effective-email-settings.ts', () => ({ loadEffectiveEmailSettings: load }))
vi.mock('../../supabase/functions/_shared/send-scheduled-reminder.ts', () => ({ sendScheduledReminder: vi.fn() }))
import { sendScheduledReminder } from '../../supabase/functions/_shared/send-scheduled-reminder'
import { runScheduledReminders } from '../../supabase/functions/_shared/run-scheduled-reminders'
const schedule = [{ days_before: 1, time: '09:00', enabled: true }]
function fixture(overrides: {
  finalPrice?: number
  reservation?: Record<string, unknown>
  event?: Record<string, unknown>
  eligibility?: { reservations?: Record<string, unknown> | null; schedule_events?: Record<string, unknown> | null }
} = {}) {
  const writes: unknown[] = []
  const filters: string[] = []
  const event = {
    id: 'event', organization_id: 'org', store_id: 'store', date: '2099-01-02',
    start_time: '10:00', end_time: '12:00', scenario: '仮作品', venue: '仮店舗', is_cancelled: false,
    ...overrides.event,
  }
  const reservation = {
    id: 'reservation', organization_id: 'org', customer_email: 'fixture@example.invalid',
    customer_name: '仮', participant_count: 1, total_price: 3000,
    final_price: overrides.finalPrice ?? 0, discount_amount: 3000 - (overrides.finalPrice ?? 0),
    reservation_number: 'fixture', status: 'confirmed', schedule_event_id: 'event',
    ...overrides.reservation,
  }
  const eligibility = {
    reservations: overrides.eligibility?.reservations === undefined
      ? { status: reservation.status, schedule_event_id: reservation.schedule_event_id }
      : overrides.eligibility.reservations,
    schedule_events: overrides.eligibility?.schedule_events === undefined
      ? { is_cancelled: event.is_cancelled }
      : overrides.eligibility.schedule_events,
  }
  const rows: Record<string, unknown[]> = {
    operating_setting_overrides: [{ id: 'setting', schedule }],
    email_settings: [],
    schedule_events: [event],
    reservations: [reservation],
  }
  const db = {
    from(table: string) {
      const query = {
        select: () => query, order: () => query, not: () => query,
        in: () => query, eq: (key: string, value: unknown) => { filters.push(`${table}.${key}=${value}`); return query },
        range: async () => ({ data: rows[table] ?? [], error: null }),
        maybeSingle: async () => ({
          data: table === 'reservations' || table === 'schedule_events'
            ? eligibility[table as 'reservations' | 'schedule_events']
            : (rows[table]?.[0] ?? null),
          error: null,
        }),
        update: (body: unknown) => { writes.push(body); return query },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
      return query
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ delivery_id: 'delivery', lease_token: 'lease' }], error: null }),
  }
  vi.mocked(sendScheduledReminder).mockReset().mockResolvedValue({ success: true })
  return { db, writes, filters }
}
beforeEach(() => { load.mockReset(); load.mockResolvedValue({ reminder_enabled: true, reminder_schedule: schedule }) })
describe('自動リマインド実行', () => {
  const now = new Date('2099-01-01T00:00:00Z')
  it('実効日程に一致するときだけclaimし、組織・予約・送信単位を渡す', async () => {
    const { db, writes, filters } = fixture()
    const result = await runScheduledReminders(db, now)
    expect(result).toMatchObject({ sent: 1, failures: 0 })
    expect(db.rpc).toHaveBeenCalledWith('claim_scheduled_reminder', expect.objectContaining({ p_organization_id: 'org', p_reservation_id: 'reservation', p_days_before: 1, p_send_time: '09:00' }))
    expect(vi.mocked(sendScheduledReminder)).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 'delivery', deliveryLeaseToken: 'lease', scheduleEventId: 'event', totalPrice: 0 }))
    expect(writes).toContainEqual(expect.objectContaining({ status: 'sent' }))
    expect(filters).toContain('scheduled_reminder_deliveries.lease_token=lease')
    expect(filters).toContain('schedule_events.is_cancelled=false')
  })
  it('一部割引もDBの確定金額を送る', async () => {
    const { db } = fixture({ finalPrice: 1500 })
    await runScheduledReminders(db, now)
    expect(vi.mocked(sendScheduledReminder)).toHaveBeenCalledWith(expect.objectContaining({ totalPrice: 1500 }))
  })
  it('既に送信済み・他の処理が実行中なら送らない', async () => {
    const { db } = fixture(); db.rpc.mockResolvedValue({ data: [], error: null })
    expect(await runScheduledReminders(db, now)).toMatchObject({ sent: 0, skipped: 1 })
    expect(vi.mocked(sendScheduledReminder)).not.toHaveBeenCalled()
  })
  it('無効化した公演と、まだ送信時刻になっていない公演は送らない', async () => {
    const { db } = fixture()
    load.mockResolvedValueOnce({ reminder_enabled: false, reminder_schedule: schedule })
    await runScheduledReminders(db, now)
    await runScheduledReminders(db, new Date('2098-12-31T23:59:00Z'))
    expect(db.rpc).not.toHaveBeenCalled()
    expect(vi.mocked(sendScheduledReminder)).not.toHaveBeenCalled()
  })
  it('送信失敗を成功扱いにせず同じclaimを再試行可能にする', async () => {
    const { db, writes } = fixture()
    vi.mocked(sendScheduledReminder).mockRejectedValue(new Error('reminder sender HTTP 403'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runScheduledReminders(db, now)).toMatchObject({ sent: 0, failures: 1 })
    expect(writes).toContainEqual({ status: 'failed' })
    spy.mockRestore()
  })
  it('実効設定の読取り失敗時は既定日程で送らない', async () => {
    const { db } = fixture(); load.mockRejectedValue(new Error('settings unavailable'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runScheduledReminders(db, now)).toMatchObject({ sent: 0, failures: 1 })
    expect(vi.mocked(sendScheduledReminder)).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it.each([
    { name: '中止', eligibility: { schedule_events: { is_cancelled: true } } },
    { name: '予約取消', eligibility: { reservations: { status: 'cancelled', schedule_event_id: 'event' } } },
    { name: '削除後の紐付け切れ', eligibility: { reservations: { status: 'confirmed', schedule_event_id: null }, schedule_events: null } },
  ])('claim後に$nameなら送らずスキップする', async ({ eligibility }) => {
    const { db, writes } = fixture({ eligibility })
    expect(await runScheduledReminders(db, now)).toMatchObject({ sent: 0, skipped: 1, failures: 0 })
    expect(vi.mocked(sendScheduledReminder)).not.toHaveBeenCalled()
    expect(writes).toContainEqual({ status: 'failed' })
  })
})
