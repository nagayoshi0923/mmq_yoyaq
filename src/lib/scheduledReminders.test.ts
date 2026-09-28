import { beforeEach, describe, expect, it, vi } from 'vitest'
const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../supabase/functions/_shared/effective-email-settings.ts', () => ({ loadEffectiveEmailSettings: load }))
import { runScheduledReminders } from '../../supabase/functions/_shared/run-scheduled-reminders'
const schedule = [{ days_before: 1, time: '09:00', enabled: true }]
function fixture(finalPrice = 0, overrideRows = [{ id: 'setting', settings: { reminder_schedule: schedule } }]) {
  const writes: unknown[] = []
  const filters: string[] = []
  const rows: Record<string, unknown[]> = {
    operating_setting_overrides: overrideRows, email_settings: [],
    schedule_events: [{ id: 'event', organization_id: 'org', store_id: 'store', date: '2099-01-02', start_time: '10:00', end_time: '12:00', scenario: '仮作品', venue: '仮店舗' }],
    reservations: [{ id: 'reservation', organization_id: 'org', customer_email: 'fixture@example.invalid', customer_name: '仮', participant_count: 1, total_price: 3000, final_price: finalPrice, discount_amount: 3000 - finalPrice, reservation_number: 'fixture' }],
  }
  const db = {
    from(table: string) {
      const query = {
        select: () => query, order: () => query, not: () => query,
        in: () => query, eq: (key: string, value: unknown) => { filters.push(`${table}.${key}=${value}`); return query },
        range: async () => ({ data: rows[table] ?? [], error: null }),
        update: (body: unknown) => { writes.push(body); return query },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }
      return query
    },
    rpc: vi.fn().mockResolvedValue({ data: [{ delivery_id: 'delivery', lease_token: 'lease' }], error: null }),
  }
  const send = vi.fn().mockResolvedValue({ success: true })
  return { db, writes, filters, send }
}
beforeEach(() => { load.mockReset(); load.mockResolvedValue({ reminder_enabled: true, reminder_schedule: schedule }) })
describe('自動リマインド実行', () => {
  const now = new Date('2099-01-01T00:00:00Z')
  it('実効日程に一致するときだけclaimし、組織・予約・送信単位を渡す', async () => {
    const { db, writes, filters, send } = fixture()
    const result = await runScheduledReminders(db, now, send)
    expect(result).toMatchObject({ sent: 1, failures: 0 })
    expect(db.rpc).toHaveBeenCalledWith('claim_scheduled_reminder', expect.objectContaining({ p_organization_id: 'org', p_reservation_id: 'reservation', p_days_before: 1, p_send_time: '09:00' }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: 'delivery', deliveryLeaseToken: 'lease', totalPrice: 0 }))
    expect(writes).toContainEqual(expect.objectContaining({ status: 'sent' }))
    expect(filters).toContain('scheduled_reminder_deliveries.lease_token=lease')
  })
  it('一部割引もDBの確定金額を送る', async () => {
    const { db, send } = fixture(1500)
    await runScheduledReminders(db, now, send)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ totalPrice: 1500 }))
  })
  it('既に送信済み・他の処理が実行中なら送らない', async () => {
    const { db, send } = fixture(); db.rpc.mockResolvedValue({ data: [], error: null })
    expect(await runScheduledReminders(db, now, send)).toMatchObject({ sent: 0, skipped: 1 })
    expect(send).not.toHaveBeenCalled()
  })
  it('無効化した公演と、まだ送信時刻になっていない公演は送らない', async () => {
    const { db, send } = fixture()
    load.mockResolvedValueOnce({ reminder_enabled: false, reminder_schedule: schedule })
    await runScheduledReminders(db, now, send)
    await runScheduledReminders(db, new Date('2098-12-31T23:59:00Z'), send)
    expect(db.rpc).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
  it('送信失敗を成功扱いにせず同じclaimを再試行可能にする', async () => {
    const { db, writes, send } = fixture()
    send.mockRejectedValue(new Error('reminder not sent'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runScheduledReminders(db, now, send)).toMatchObject({ sent: 0, failures: 1 })
    expect(writes).toContainEqual({ status: 'failed' })
    spy.mockRestore()
  })
  it('実効設定の読取り失敗時は既定日程で送らない', async () => {
    const { db, send } = fixture(); load.mockRejectedValue(new Error('settings unavailable'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await runScheduledReminders(db, now, send)).toMatchObject({ sent: 0, failures: 1 })
    expect(send).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('日程候補が空でも前日既定で候補日を作る', async () => {
    const { db, send } = fixture(0, [])
    load.mockResolvedValue({ reminder_enabled: true, reminder_schedule: [] })
    expect(await runScheduledReminders(db, now, send)).toMatchObject({ sent: 1, failures: 0 })
    expect(send).toHaveBeenCalled()
  })
})
