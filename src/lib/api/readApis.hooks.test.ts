/**
 * フックの読み取りAPI（Phase 2、#773）が発行するクエリを固定する。
 * 固定するのは「どのテーブルに、どの列を、どの絞り込みで問い合わせるか」。元のフックの呼び出しと同じであることの確認用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderCalls, type RecordedCall } from './testing/chainRecorder'

const rec = vi.hoisted(() => ({ calls: [] as Array<[string, unknown[]]> }))
vi.mock('@/lib/supabase', async () => {
  const { makeSupabaseRecorder } = await import('./testing/chainRecorder')
  return { supabase: makeSupabaseRecorder(rec.calls as RecordedCall[]) }
})
import { eventReservationReadApi, eventStoreReadApi, eventScheduleReadApi } from './eventOperationsApi'
import { scheduleHookReadApi, scheduleEventsQueryReadApi, privateBookingSlotReadApi } from './scheduleHookReadApi'
import { customerLookupReadApi, scenarioLikeReadApi, notificationReadApi } from './customerHookReadApi'
import { staffSettingsReadApi, globalSettingsHookReadApi, salarySettingsReadApi } from './settingsReadApi'
import { privateGroupRpcApi } from './privateGroupRpcApi'
import { reservationAdminReadApi } from './reservationReadApi'
import { tablePreferenceApi } from './userPreferencesApi'
import { temporaryVenueApi } from './temporaryVenueApi'

beforeEach(() => { rec.calls.length = 0 })
const take = () => renderCalls(rec.calls.splice(0) as RecordedCall[])

describe('公演の保存・中止・削除', () => {
  it('組織あり・なしで、組織の絞り込みが末尾に付くか付かないか', async () => {
    await eventReservationReadApi.findWithCustomerById('r1', 'o1')
    await eventReservationReadApi.findWithCustomerById('r1', null)
    await eventReservationReadApi.listUncancelledWithCustomerByEvent('e1', 'o1')
    await eventReservationReadApi.listUncancelledWithCustomerByEvent('e1', undefined)
    await eventReservationReadApi.findActiveSummaryById('r1', 'o1')
    await eventReservationReadApi.listActiveSummaryByEvent('e1', 'o1')
    await eventReservationReadApi.findEventIdAndStatusById('r1', 'o1')
    await eventReservationReadApi.listUncancelledIdsByEvent('e1', 'o1')
    await eventReservationReadApi.findPrivateBeforeUpdate('r1', 'o1')
    await eventReservationReadApi.findScheduleEventIdById('r1')
    expect(take()).toMatchInlineSnapshot(`
      [
        "from("reservations") .select("id, organization_id, reservation_number, reservation_page_id, title, …) .eq("id", "r1") .eq("organization_id", "o1") .single()",
        "from("reservations") .select("id, organization_id, reservation_number, reservation_page_id, title, …) .eq("id", "r1") .single()",
        "from("reservations") .select("id, organization_id, reservation_number, reservation_page_id, title, …) .eq("schedule_event_id", "e1") .neq("status", "cancelled") .eq("organization_id", "o1")",
        "from("reservations") .select("id, organization_id, reservation_number, reservation_page_id, title, …) .eq("schedule_event_id", "e1") .neq("status", "cancelled")",
        "from("reservations") .select("id, customer_name, customer_email, reservation_number, participant_co…) .eq("id", "r1") .neq("status", "cancelled") .eq("organization_id", "o1") .maybeSingle()",
        "from("reservations") .select("id, customer_name, customer_email, reservation_number, participant_co…) .eq("schedule_event_id", "e1") .neq("status", "cancelled") .eq("organization_id", "o1")",
        "from("reservations") .select("id, schedule_event_id, status") .eq("id", "r1") .eq("organization_id", "o1") .maybeSingle()",
        "from("reservations") .select("id") .eq("schedule_event_id", "e1") .neq("status", "cancelled") .eq("organization_id", "o1")",
        "from("reservations") .select("\\n              store_id,\\n              display_customer_name,\\n    …) .eq("id", "r1") .eq("organization_id", "o1") .maybeSingle()",
        "from("reservations") .select("schedule_event_id") .eq("id", "r1") .maybeSingle()",
      ]
    `)
  })
  it('店舗・公演と RPC', async () => {
    await eventStoreReadApi.findIdAndName('s1', 'o1')
    await eventStoreReadApi.findForTemporaryCheck('s1', 'o1')
    await eventStoreReadApi.findTemporaryDates('s1', null)
    await eventScheduleReadApi.findDateById('e1', 'o1')
    await eventScheduleReadApi.findStaffViewById('e1', 'o1')
    await eventReservationReadApi.adminUpdateFields({ p_reservation_id: 'r1', p_updates: { status: 'cancelled' } })
    expect(take()).toMatchInlineSnapshot(`
      [
        "from("stores") .select("id, name") .eq("id", "s1") .eq("organization_id", "o1") .single()",
        "from("stores") .select("id, name, short_name, is_temporary, temporary_dates, temporary_venue_…) .eq("id", "s1") .eq("organization_id", "o1") .single()",
        "from("stores") .select("temporary_dates") .eq("id", "s1") .single()",
        "from("schedule_events") .select("date") .eq("id", "e1") .eq("organization_id", "o1") .single()",
        "from("schedule_events_staff_view") .select("id, organization_id, date, venue, store_id, scenario, scenario_master…) .eq("id", "e1") .eq("organization_id", "o1") .single()",
        "rpc("admin_update_reservation_fields", {"p_reservation_id":"r1","p_updates":{"status":"cancelled"}})",
      ]
    `)
  })
})

describe('公演まわりのフック', () => {
  it('発行するクエリ', async () => {
    await scheduleHookReadApi.listBlockedSlots('o1')
    await scheduleHookReadApi.getPublicCustomHolidays('o1')
    await scheduleHookReadApi.listOrganizationScenarioOverrides('o1')
    await scheduleEventsQueryReadApi.listStatusesByEventIds(['e1'], 'o1')
    await scheduleEventsQueryReadApi.listStatusesByEventIds(['e1'], null)
    await scheduleEventsQueryReadApi.listConfirmedPrivateWithoutEvent('o1')
    await scheduleEventsQueryReadApi.listConfirmedPrivateWithoutEvent(undefined)
    await scheduleEventsQueryReadApi.listNicknamesByReservationIds(['r1'])
    await privateBookingSlotReadApi.listActiveStoreIds('o1')
    await privateBookingSlotReadApi.listAvailabilityEvents('o1', ['s1'], '2026-10-01', '2026-10-31')
    await privateBookingSlotReadApi.listBusinessHours(['s1'])
    await privateBookingSlotReadApi.getPublicAvailability({ p_organization_id: 'o1', p_store_ids: ['s1'], p_start_date: '2026-10-01', p_end_date: '2026-10-31' })
    await privateBookingSlotReadApi.getEffectiveDeadlineDays({ scenarioId: null, organizationId: 'o1', organizationSlug: null })
    expect(take()).toMatchInlineSnapshot(`
      [
        "from("schedule_blocked_slots") .select("date, store_id, time_slot") .eq("organization_id", "o1")",
        "rpc("get_public_custom_holidays", {"p_organization_id":"o1"})",
        "from("organization_scenarios_with_master") .select("scenario_master_id, duration, participation_fee, extra_preparation_ti…) .eq("organization_id", "o1")",
        "from("reservations") .select("schedule_event_id, status") .in("schedule_event_id", ["e1"]) .eq("organization_id", "o1")",
        "from("reservations") .select("schedule_event_id, status") .in("schedule_event_id", ["e1"])",
        "from("reservations") .select("\\n      id, title, customer_name, display_customer_name, status, stor…) .eq("reservation_source", "web_private") .eq("status", "confirmed") .is("schedule_event_id", null) .eq("organization_id", "o1")",
        "from("reservations") .select("\\n      id, title, customer_name, display_customer_name, status, stor…) .eq("reservation_source", "web_private") .eq("status", "confirmed") .is("schedule_event_id", null)",
        "from("reservations") .select("id, customer_name, display_customer_name, customers:customer_id(nickn…) .in("id", ["r1"])",
        "from("stores") .select("id") .match({"organization_id":"o1","status":"active"}) .or("is_temporary.is.null,is_temporary.eq.false") .neq("ownership_type", "office")",
        "from("schedule_events_for_availability") .select("id, date, store_id, start_time, end_time, is_cancelled") .eq("organization_id", "o1") .in("store_id", ["s1"]) .gte("date", "2026-10-01") .lte("date", "2026-10-31") .eq("is_cancelled", false)",
        "from("business_hours_settings") .select("store_id, opening_hours, holidays, special_open_days, special_closed_…) .in("store_id", ["s1"])",
        "rpc("get_public_private_booking_availability", {"p_organization_id":"o1","p_store_ids":["s1"],"p_start_date":"2026-10…)",
        "rpc("get_effective_private_booking_deadline_days", {"p_scenario_id":null,"p_organization_id":"o1","p_organization_slug":n…)",
      ]
    `)
  })
})

describe('顧客・設定のフック', () => {
  it('発行するクエリ', async () => {
    await customerLookupReadApi.findByUserId('u1')
    await customerLookupReadApi.findByEmail('a@example.com')
    await customerLookupReadApi.findIdByUserIdOrEmail('u1', 'a@example.com')
    await customerLookupReadApi.findIdByEmail('a@example.com')
    await customerLookupReadApi.findIdByUserId('u1')
    await scenarioLikeReadApi.listByCustomer('c1')
    await notificationReadApi.listUserNotifications()
    await notificationReadApi.listRecentConfirmedReservations('c1', '2026-10-01T00:00:00.000Z')
    await notificationReadApi.listUpcomingReservations('c1', '2026-10-01T00:00:00.000Z', '2026-10-04T00:00:00.000Z')
    await notificationReadApi.listNotifiedWaitlist('c1')
    await notificationReadApi.listRecentCancelledReservations('c1', '2026-09-26T00:00:00.000Z')
    await staffSettingsReadApi.listByUserId('u1')
    await globalSettingsHookReadApi.getByOrganization('o1')
    await salarySettingsReadApi.getByOrganization('o1')
    await salarySettingsReadApi.findCurrentHistory('o1', '2026-10-03')
    await salarySettingsReadApi.findNextHistory('o1', '2026-10-01')
    await tablePreferenceApi.load('u1', 'staff')
    await temporaryVenueApi.listByOrganization('o1')
    await temporaryVenueApi.listEventIdsOnDate('s1', '2026-10-10')
    expect(take()).toMatchInlineSnapshot(`
      [
        "from("customers") .select("id, user_id") .eq("user_id", "u1") .maybeSingle()",
        "from("customers") .select("id, user_id") .eq("email", "a@example.com") .maybeSingle()",
        "from("customers") .select("id") .or("user_id.eq.u1,email.eq.a@example.com") .maybeSingle()",
        "from("customers") .select("id") .eq("email", "a@example.com") .maybeSingle()",
        "from("customers") .select("id") .eq("user_id", "u1") .maybeSingle()",
        "from("scenario_likes") .select("scenario_id, scenario_master_id") .eq("customer_id", "c1")",
        "from("user_notifications") .select("id, type, title, message, created_at, is_read, link, metadata") .order("created_at", {"ascending":false}) .limit(20)",
        "from("reservations") .select("id, reservation_number, title, created_at, requested_datetime") .eq("customer_id", "c1") .gte("created_at", "2026-10-01T00:00:00.000Z") .in("status", ["confirmed","gm_confirmed"]) .order("created_at", {"ascending":false}) .limit(5)",
        "from("reservations") .select("id, reservation_number, title, requested_datetime") .eq("customer_id", "c1") .gte("requested_datetime", "2026-10-01T00:00:00.000Z") .lte("requested_datetime", "2026-10-04T00:00:00.000Z") .in("status", ["confirmed","gm_confirmed"]) .order("requested_datetime", {"ascending":true}) .limit(3)",
        "from("waitlist") .select("\\n          id, \\n          created_at,\\n          schedule_events(id…) .eq("customer_id", "c1") .eq("status", "notified") .order("created_at", {"ascending":false}) .limit(3)",
        "from("reservations") .select("id, reservation_number, title, cancelled_at, requested_datetime, canc…) .eq("customer_id", "c1") .eq("status", "cancelled") .gte("cancelled_at", "2026-09-26T00:00:00.000Z") .order("cancelled_at", {"ascending":false}) .limit(5)",
        "from("staff") .select("id, organization_id, name, line_name, x_account, discord_id:discord_u…) .eq("user_id", "u1")",
        "from("global_settings") .select("id, organization_id, shift_submission_start_day, shift_submission_end…) .eq("organization_id", "o1") .single()",
        "from("global_settings") .select("organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_te…) .eq("organization_id", "o1") .single()",
        "from("salary_settings_history") .select("effective_from") .eq("organization_id", "o1") .lte("effective_from", "2026-10-03") .order("effective_from", {"ascending":false}) .limit(1) .maybeSingle()",
        "from("salary_settings_history") .select("effective_from") .eq("organization_id", "o1") .gt("effective_from", "2026-10-01") .order("effective_from", {"ascending":true}) .limit(1) .maybeSingle()",
        "from("user_table_preferences") .select("column_order, column_visibility") .eq("user_id", "u1") .eq("table_key", "staff") .maybeSingle()",
        "from("stores") .select("id, name, short_name, is_temporary, temporary_dates, temporary_venue_…) .eq("is_temporary", true) .eq("organization_id", "o1") .order("name", {"ascending":true})",
        "from("schedule_events") .select("id") .eq("store_id", "s1") .eq("date", "2026-10-10") .limit(1)",
      ]
    `)
  })
})

describe('予約管理の一覧・統計と貸切グループの RPC', () => {
  it('一覧は、組織・状態・支払い・種別・検索語の有無で絞り込みが変わる', async () => {
    await reservationAdminReadApi.listPage({ organizationId: 'o1', statusFilter: 'confirmed', paymentFilter: 'unpaid', typeFilter: 'web', searchTerm: '山田', from: 0, to: 49 })
    const all = take()
    await reservationAdminReadApi.listPage({ organizationId: null, statusFilter: 'all', paymentFilter: 'all', typeFilter: 'all', searchTerm: '', from: 50, to: 99 })
    expect({ all, none: take() }).toMatchInlineSnapshot(`
      {
        "all": [
          "from("reservations") .select("\\n          *,\\n          scenario_masters:scenario_master_id (title)…, {"count":"exact"}) .eq("organization_id", "o1") .eq("status", "confirmed") .eq("payment_status", "unpaid") .eq("reservation_source", "web") .or("reservation_number.ilike.%山田%,customer_name.ilike.%山田%,title.ilike.%山…) .order("created_at", {"ascending":false}) .order("priority", {"ascending":false,"nullsFirst":false}) .range(0, 49)",
        ],
        "none": [
          "from("reservations") .select("\\n          *,\\n          scenario_masters:scenario_master_id (title)…, {"count":"exact"}) .order("created_at", {"ascending":false}) .order("priority", {"ascending":false,"nullsFirst":false}) .range(50, 99)",
        ],
      }
    `)
  })
  it('統計は 7 本の問い合わせで、組織があれば全部に組織の絞り込みが付く', async () => {
    await reservationAdminReadApi.fetchStats('o1', '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z')
    const withOrg = take()
    await reservationAdminReadApi.fetchStats(null, '2026-10-01T00:00:00.000Z', '2026-10-31T23:59:59.999Z')
    expect({ withOrg, withoutOrg: take() }).toMatchInlineSnapshot(`
      {
        "withOrg": [
          "from("reservations") .select("*", {"count":"exact","head":true})",
          "from("reservations") .select("*", {"count":"exact","head":true}) .in("status", ["confirmed","gm_confirmed"])",
          "from("reservations") .select("*", {"count":"exact","head":true}) .in("status", ["pending","pending_gm","pending_store"])",
          "from("reservations") .select("*", {"count":"exact","head":true}) .eq("status", "cancelled")",
          "from("reservations") .select("*", {"count":"exact","head":true}) .eq("payment_status", "unpaid") .neq("status", "cancelled")",
          "from("reservations") .select("*", {"count":"exact","head":true}) .gte("requested_datetime", "2026-10-01T00:00:00.000Z") .lte("requested_datetime", "2026-10-31T23:59:59.999Z")",
          "from("reservations") .select("status, total_price, final_price, requested_datetime") .gte("requested_datetime", "2026-10-01T00:00:00.000Z") .lte("requested_datetime", "2026-10-31T23:59:59.999Z") .eq("organization_id", "o1") .eq("organization_id", "o1") .eq("organization_id", "o1") .eq("organization_id", "o1") .eq("organization_id", "o1") .eq("organization_id", "o1") .eq("organization_id", "o1")",
        ],
        "withoutOrg": [
          "from("reservations") .select("*", {"count":"exact","head":true})",
          "from("reservations") .select("*", {"count":"exact","head":true}) .in("status", ["confirmed","gm_confirmed"])",
          "from("reservations") .select("*", {"count":"exact","head":true}) .in("status", ["pending","pending_gm","pending_store"])",
          "from("reservations") .select("*", {"count":"exact","head":true}) .eq("status", "cancelled")",
          "from("reservations") .select("*", {"count":"exact","head":true}) .eq("payment_status", "unpaid") .neq("status", "cancelled")",
          "from("reservations") .select("*", {"count":"exact","head":true}) .gte("requested_datetime", "2026-10-01T00:00:00.000Z") .lte("requested_datetime", "2026-10-31T23:59:59.999Z")",
          "from("reservations") .select("status, total_price, final_price, requested_datetime") .gte("requested_datetime", "2026-10-01T00:00:00.000Z") .lte("requested_datetime", "2026-10-31T23:59:59.999Z")",
        ],
      }
    `)
  })
  it('貸切グループの RPC', async () => {
    await privateGroupRpcApi.createAtomic({ p_organization_id: 'o1' })
    await privateGroupRpcApi.join({ p_invite_code: 'X' })
    await privateGroupRpcApi.cancelUnrequested('g1')
    await privateGroupRpcApi.removeMember('m1')
    await privateGroupRpcApi.leave('g1')
    expect(take()).toMatchInlineSnapshot(`
      [
        "rpc("create_private_group_atomic", {"p_organization_id":"o1"})",
        "rpc("join_private_group", {"p_invite_code":"X"})",
        "rpc("cancel_unrequested_private_group", {"p_group_id":"g1"})",
        "rpc("private_group_remove_member", {"p_member_id":"m1"})",
        "rpc("private_group_leave", {"p_group_id":"g1"})",
      ]
    `)
  })
})
