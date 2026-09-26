import { describe, expect, it } from 'vitest'
import { loadPrivateBookingNotificationContext, loadPrivateBookingAssignedStaff } from '../supabase/functions/_shared/private-booking-notification-context'

function database(rows: Record<string, any[]>, failures: string[] = []) {
  return { from(table: string) {
    let selected = rows[table] ?? []
    const query = {
      select() { return query },
      eq(key: string, value: unknown) { selected = selected.filter(row => row[key] === value); return query },
      in(key: string, values: unknown[]) { selected = selected.filter(row => values.includes(row[key])); return query },
      or() { selected = selected.filter(row => row.can_main_gm || row.can_sub_gm); return query },
      maybeSingle() { return Promise.resolve({ data: selected[0] ?? null, error: failures.includes(table) ? new Error('DB error') : null }) },
      then(resolve: (value: any) => unknown) { return Promise.resolve({ data: selected, error: failures.includes(table) ? new Error('DB error') : null }).then(resolve) },
    }
    return query
  } }
}
function fixture() {
  return {
    reservations: [{ id: 'booking', reservation_type: 'private_booking', status: 'pending', organization_id: 'org', scenario_id: 'legacy', customer_name: 'Saved customer' }],
    organization_scenarios: [{ id: 'legacy', organization_id: 'org', scenario_master_id: 'master' }],
    users: [{ id: 'admin', organization_id: 'org', role: 'admin' }],
    staff: [] as any[],
  }
}
describe('saved private booking notification context', () => {
  it('resolves legacy organization scenario using the saved booking', async () => {
    const context = await loadPrivateBookingNotificationContext(database(fixture()), 'booking', 'admin')
    expect(context).toMatchObject({ organization_id: 'org', scenario_id: 'master', scenario_master_id: 'master', customer_name: 'Saved customer' })
  })
  it('rejects regular and cancelled reservations', async () => {
    const rows = fixture(); rows.reservations[0].reservation_type = 'normal'
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', null)).rejects.toThrow('not accepting')
    rows.reservations[0].reservation_type = 'private_booking'; rows.reservations[0].status = 'cancelled'
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', null)).rejects.toThrow('not accepting')
  })
  it('rejects another organization and missing user', async () => {
    const rows = fixture(); rows.users[0].organization_id = 'other'
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', 'admin')).rejects.toThrow('Forbidden')
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', 'missing')).rejects.toThrow('Forbidden')
  })
  it('rejects retired admin and database errors', async () => {
    const rows = fixture(); rows.staff.push({ user_id: 'admin', organization_id: 'org', status: 'resigned' })
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', 'admin')).rejects.toThrow('Forbidden')
    await expect(loadPrivateBookingNotificationContext(database(fixture(), ['staff']), 'booking', 'admin')).rejects.toThrow('DB error')
  })
  it('rejects absent reservations and cross-organization scenarios for system calls too', async () => {
    const rows = fixture(); rows.organization_scenarios[0].organization_id = 'other'
    await expect(loadPrivateBookingNotificationContext(database(rows), 'booking', null)).rejects.toThrow('Scenario not found')
    await expect(loadPrivateBookingNotificationContext(database(rows), 'missing', null)).rejects.toThrow('Reservation not found')
  })
  it('accepts canonical master IDs only when assigned to the booking organization', async () => {
    const rows = fixture(); rows.reservations[0].scenario_id = 'master'
    expect((await loadPrivateBookingNotificationContext(database(rows), 'booking', null)).scenario_master_id).toBe('master')
  })
})
it('pending respondents are active assigned staff, including those without a Discord channel', async () => {
  const rows = {
    staff_scenario_assignments: [
      ...['valid', 'no-channel', 'retired', 'foreign'].map(staff_id => ({ staff_id, organization_id: 'org', scenario_master_id: 'master', can_main_gm: true })),
      { staff_id: 'other-work', organization_id: 'org', scenario_master_id: 'other', can_main_gm: true },
      { staff_id: 'no-role', organization_id: 'org', scenario_master_id: 'master', can_main_gm: false },
    ],
    staff: [
      { id: 'valid', organization_id: 'org', status: 'active', discord_channel_id: '123' },
      { id: 'no-channel', organization_id: 'org', status: 'active', discord_channel_id: null },
      { id: 'retired', organization_id: 'org', status: 'resigned' },
      { id: 'foreign', organization_id: 'other', status: 'active' },
      { id: 'other-work', organization_id: 'org', status: 'active' },
      { id: 'no-role', organization_id: 'org', status: 'active' },
    ],
  }
  expect((await loadPrivateBookingAssignedStaff(database(rows), 'org', 'master')).map((row: any) => row.id)).toEqual(['valid', 'no-channel'])
  await expect(loadPrivateBookingAssignedStaff(database(rows, ['staff_scenario_assignments']), 'org', 'master')).rejects.toThrow('DB error')
})
