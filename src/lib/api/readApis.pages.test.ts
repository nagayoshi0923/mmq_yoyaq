/**
 * 画面（src/pages）の読み取り・RPC の API（Phase 2、#773）が発行するクエリを固定する。
 * 各関数を、引数に a1, a2, … を渡して呼び、発行された問い合わせ（テーブル・列・絞り込み・並び順・RPC 名と引数）を記録する。
 * 最後の引数を省いた呼び出し（組織が分からないとき等）も、結果が変わる関数だけ記録する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderCalls, type RecordedCall } from './testing/chainRecorder'

const rec = vi.hoisted(() => ({ calls: [] as Array<[string, unknown[]]> }))
vi.mock('@/lib/supabase', async () => {
  const { makeSupabaseRecorder } = await import('./testing/chainRecorder')
  return { supabase: makeSupabaseRecorder(rec.calls as RecordedCall[]) }
})
import * as settingsPage from './settingsPageReadApi'
import * as staffPage from './staffPageReadApi'
import * as publicPage from './publicPageReadApi'
import * as myPage from './myPageReadApi'
import * as bookingSite from './bookingSiteRpcApi'
import * as bookingConfirmation from './bookingConfirmationReadApi'
import * as couponPage from './couponPageReadApi'
import * as gmAvailability from './gmAvailabilityReadApi'
import * as completeProfile from './completeProfileReadApi'
import * as licenseReport from './licenseReportReadApi'
import * as platformPage from './platformPageReadApi'
import * as reportForm from './reportFormReadApi'
import * as userRole from './userRoleReadApi'
import * as orgSignup from './orgSignupRpcApi'
import * as demoParticipants from './demoParticipantsReadApi'
import * as privateBookingMgmt from './privateBookingMgmtReadApi'
import * as privateBookingRequest from './privateBookingRequestReadApi'
import * as privateGroupPage from './privateGroupPageReadApi'
import * as publicBooking from './publicBookingReadApi'
import * as salesPage from './salesPageReadApi'
import * as scenarioPage from './scenarioPageReadApi'
import * as scheduleManager from './scheduleManagerReadApi'
import * as privateGroupRpc from './privateGroupRpcApi'

beforeEach(() => { rec.calls.length = 0 })

type Fn = (...args: unknown[]) => Promise<unknown>
const OBJECT_ARGS: Record<string, unknown[]> = {
  'emailLogReadApi.listPage': [{ page: 1, pageSize: 50, status: 'sent', type: 'reservation_confirmation', dateFrom: '2026-10-01', dateTo: '2026-10-31', escapedKeyword: 'k' }],
}

async function record(name: string, fn: Fn, args: unknown[]) {
  rec.calls.length = 0
  try { await fn(...args) } catch (e) { return [`ERROR ${(e as Error).message}`] }
  return renderCalls(rec.calls.splice(0) as RecordedCall[])
}

async function snapshotModule(mod: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [objName, obj] of Object.entries(mod)) {
    if (typeof obj !== 'object' || obj === null) continue
    for (const [fname, fn] of Object.entries(obj as Record<string, Fn>)) {
      if (typeof fn !== 'function') continue
      const key = `${objName}.${fname}`
      const args = OBJECT_ARGS[key] ?? Array.from({ length: fn.length }, (_, i) => `a${i + 1}`)
      const full = await record(key, fn.bind(obj), args)
      out[key] = full
      if (!OBJECT_ARGS[key] && fn.length > 0) {
        const fewer = await record(key, fn.bind(obj), args.slice(0, -1))
        if (JSON.stringify(fewer) !== JSON.stringify(full)) out[`${key} (最後の引数なし)`] = fewer
      }
    }
  }
  return out
}

describe('設定・スタッフ・公開ページ', () => {
  it('設定画面', async () => { expect(await snapshotModule(settingsPage)).toMatchInlineSnapshot(`
    {
      "emailLogReadApi.listPage": [
        "from("email_logs") .select("id, organization_id, reservation_id, schedule_event_id, email_type, t…, {"count":"exact"}) .order("created_at", {"ascending":false}) .range(50, 99) .eq("status", "sent") .eq("email_type", "reservation_confirmation") .gte("created_at", "2026-10-01T00:00:00+09:00") .lte("created_at", "2026-10-31T23:59:59+09:00") .or("to_email.ilike.%k%,to_name.ilike.%k%,subject.ilike.%k%,provider_messa…)",
      ],
      "notificationSettingsListReadApi.listActiveStaff": [
        "from("staff") .select("id, name, discord_channel_id") .eq("status", "active") .eq("organization_id", "a1") .order("name")",
      ],
      "notificationSettingsListReadApi.listActiveStaff (最後の引数なし)": [
        "from("staff") .select("id, name, discord_channel_id") .eq("status", "active") .order("name")",
      ],
      "notificationSettingsListReadApi.listScenarioTitles": [
        "from("organization_scenarios_with_master") .select("id, title") .order("title") .eq("organization_id", "a1")",
      ],
      "notificationSettingsListReadApi.listScenarioTitles (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title") .order("title")",
      ],
      "settingsPageReadApi.getDataManagementSettings": [
        "from("data_management_settings") .select("id, store_id, export_format") .eq("store_id", "a1") .maybeSingle()",
      ],
      "settingsPageReadApi.getDataManagementSettings (最後の引数なし)": [
        "from("data_management_settings") .select("id, store_id, export_format") .eq("store_id", undefined) .maybeSingle()",
      ],
      "settingsPageReadApi.getGlobalNotificationSettings": [
        "from("global_settings") .select("id, enable_email_notifications, enable_discord_notifications, pre_rea…) .eq("organization_id", "a1") .single()",
      ],
      "settingsPageReadApi.getGlobalNotificationSettings (最後の引数なし)": [
        "from("global_settings") .select("id, enable_email_notifications, enable_discord_notifications, pre_rea…) .eq("organization_id", undefined) .single()",
      ],
      "settingsPageReadApi.getSalarySettings": [
        "from("global_settings") .select("id, organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, g…) .eq("organization_id", "a1") .single()",
      ],
      "settingsPageReadApi.getSalarySettings (最後の引数なし)": [
        "from("global_settings") .select("id, organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, g…) .eq("organization_id", undefined) .single()",
      ],
      "settingsPageReadApi.getShiftSettings": [
        "from("global_settings") .select("id, shift_submission_start_day, shift_submission_end_day, shift_submi…) .eq("organization_id", "a1") .single()",
      ],
      "settingsPageReadApi.getShiftSettings (最後の引数なし)": [
        "from("global_settings") .select("id, shift_submission_start_day, shift_submission_end_day, shift_submi…) .eq("organization_id", undefined) .single()",
      ],
      "settingsPageReadApi.getStoreNotificationSettings": [
        "from("notification_settings") .select("id, store_id, organization_id, new_reservation_email, new_reservation…) .eq("store_id", "a1") .maybeSingle()",
      ],
      "settingsPageReadApi.getStoreNotificationSettings (最後の引数なし)": [
        "from("notification_settings") .select("id, store_id, organization_id, new_reservation_email, new_reservation…) .eq("store_id", undefined) .maybeSingle()",
      ],
      "settingsPageReadApi.getSystemName": [
        "from("global_settings") .select("id, system_name") .eq("organization_id", "a1") .single()",
      ],
      "settingsPageReadApi.getSystemName (最後の引数なし)": [
        "from("global_settings") .select("id, system_name") .eq("organization_id", undefined) .single()",
      ],
      "settingsPageReadApi.listBlogPosts": [
        "from("blog_posts") .select("id, organization_id, title, slug, excerpt, content, cover_image_url, …) .eq("organization_id", "a1") .order("created_at", {"ascending":false})",
      ],
      "settingsPageReadApi.listBlogPosts (最後の引数なし)": [
        "from("blog_posts") .select("id, organization_id, title, slug, excerpt, content, cover_image_url, …) .eq("organization_id", undefined) .order("created_at", {"ascending":false})",
      ],
      "settingsPageReadApi.listBookingNotices": [
        "from("booking_notices") .select("id, organization_id, content, applicable_types, store_id, store_ids, …) .order("sort_order", {"ascending":true})",
      ],
      "settingsPageReadApi.listOrgMasterItems": [
        "from("a1") .select("id, organization_id, name, sort_order, created_at, updated_at") .eq("organization_id", "a2") .order("sort_order", {"ascending":true})",
      ],
      "settingsPageReadApi.listOrgMasterItems (最後の引数なし)": [
        "from("a1") .select("id, organization_id, name, sort_order, created_at, updated_at") .eq("organization_id", undefined) .order("sort_order", {"ascending":true})",
      ],
      "settingsPageReadApi.listOrganizationAdmins": [
        "from("users") .select("id, email, display_name, role, created_at") .eq("organization_id", "a1") .in("role", ["admin","license_admin"]) .order("created_at")",
      ],
      "settingsPageReadApi.listOrganizationAdmins (最後の引数なし)": [
        "from("users") .select("id, email, display_name, role, created_at") .eq("organization_id", undefined) .in("role", ["admin","license_admin"]) .order("created_at")",
      ],
      "settingsPageReadApi.listReservationsForExport": [
        "from("reservations") .select("reservation_number, status, actual_datetime, duration, participant_co…) .eq("organization_id", "a1") .gte("actual_datetime", "a2T00:00:00") .lte("actual_datetime", "a3T23:59:59") .order("actual_datetime", {"ascending":false})",
      ],
      "settingsPageReadApi.listReservationsForExport (最後の引数なし)": [
        "from("reservations") .select("reservation_number, status, actual_datetime, duration, participant_co…) .eq("organization_id", "a1") .gte("actual_datetime", "a2T00:00:00") .lte("actual_datetime", "undefinedT23:59:59") .order("actual_datetime", {"ascending":false})",
      ],
      "settingsPageReadApi.listScenarioColumn": [
        "from("organization_scenarios_with_master") .select("a1") .eq("organization_id", "a2")",
      ],
      "settingsPageReadApi.listScenarioColumn (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("a1") .eq("organization_id", undefined)",
      ],
      "settingsPageReadApi.listScenariosForExport": [
        "from("organization_scenarios_with_master") .select("title, author, report_display_name, genre, difficulty, duration, week…) .eq("organization_id", "a1") .order("title")",
      ],
      "settingsPageReadApi.listScenariosForExport (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("title, author, report_display_name, genre, difficulty, duration, week…) .eq("organization_id", undefined) .order("title")",
      ],
      "settingsPageReadApi.listScenariosWithGenre": [
        "from("organization_scenarios") .select("id, override_genre") .eq("organization_id", "a1") .contains("override_genre", ["a2"])",
      ],
      "settingsPageReadApi.listScenariosWithGenre (最後の引数なし)": [
        "from("organization_scenarios") .select("id, override_genre") .eq("organization_id", "a1") .contains("override_genre", [null])",
      ],
      "settingsPageReadApi.listStaffForExport": [
        "from("staff") .select("name, line_name, email, phone, status, role, created_at, stores(short…) .eq("organization_id", "a1") .order("name")",
      ],
      "settingsPageReadApi.listStaffForExport (最後の引数なし)": [
        "from("staff") .select("name, line_name, email, phone, status, role, created_at, stores(short…) .eq("organization_id", undefined) .order("name")",
      ],
      "settingsPageReadApi.listStaffNamesByUserIds": [
        "from("staff") .select("user_id, name") .in("user_id", "a1")",
      ],
      "settingsPageReadApi.listStaffNamesByUserIds (最後の引数なし)": [
        "from("staff") .select("user_id, name") .in("user_id", undefined)",
      ],
    }
  `) })
  it('スタッフ管理', async () => { expect(await snapshotModule(staffPage)).toMatchInlineSnapshot(`
    {
      "staffPageReadApi.findStaffByUserId": [
        "from("staff") .select("id, name") .eq("user_id", "a1") .single()",
      ],
      "staffPageReadApi.findStaffByUserId (最後の引数なし)": [
        "from("staff") .select("id, name") .eq("user_id", undefined) .single()",
      ],
      "staffPageReadApi.findUserByEmail": [
        "from("users") .select("id, email") .eq("email", "a1") .single()",
      ],
      "staffPageReadApi.findUserByEmail (最後の引数なし)": [
        "from("users") .select("id, email") .eq("email", undefined) .single()",
      ],
      "staffPageReadApi.findUserByEmailWithRole": [
        "from("users") .select("id, email, role") .eq("email", "a1") .single()",
      ],
      "staffPageReadApi.findUserByEmailWithRole (最後の引数なし)": [
        "from("users") .select("id, email, role") .eq("email", undefined) .single()",
      ],
      "staffPageReadApi.listEventsForGmCount": [
        "from("schedule_events") .select("gms, gm_roles, category") .eq("organization_id", "a1") .eq("is_cancelled", false) .gte("date", "a2") .lte("date", "a3")",
      ],
      "staffPageReadApi.listEventsForGmCount (最後の引数なし)": [
        "from("schedule_events") .select("gms, gm_roles, category") .eq("organization_id", "a1") .eq("is_cancelled", false) .gte("date", "a2") .lte("date", undefined)",
      ],
      "staffPageReadApi.listOrganizationScenariosForProfile": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, title, author, gm_count, scenario_kind") .eq("organization_id", "a1") .order("title", {"ascending":true})",
      ],
      "staffPageReadApi.listOrganizationScenariosForProfile (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, title, author, gm_count, scenario_kind") .eq("organization_id", undefined) .order("title", {"ascending":true})",
      ],
      "staffPageReadApi.listScenarioAssignmentsByStaff": [
        "from("staff_scenario_assignments") .select("scenario_master_id, can_gm, has_experienced") .eq("staff_id", "a1")",
      ],
      "staffPageReadApi.listScenarioAssignmentsByStaff (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("scenario_master_id, can_gm, has_experienced") .eq("staff_id", undefined)",
      ],
      "staffPageReadApi.listScenarioMasterTitles": [
        "from("scenario_masters") .select("id, title")",
      ],
      "staffPageReadApi.listStaffParticipationReservations": [
        "from("reservations") .select("participant_names") .eq("organization_id", "a1") .in("reservation_source", ["staff_entry","staff_participation"]) .gte("requested_datetime", "a2") .lte("requested_datetime", "a3T23:59:59+09:00")",
      ],
      "staffPageReadApi.listStaffParticipationReservations (最後の引数なし)": [
        "from("reservations") .select("participant_names") .eq("organization_id", "a1") .in("reservation_source", ["staff_entry","staff_participation"]) .gte("requested_datetime", "a2") .lte("requested_datetime", "undefinedT23:59:59+09:00")",
      ],
      "staffPageReadApi.listUsersByIds": [
        "from("users") .select("id, email, created_at, updated_at") .in("id", "a1")",
      ],
      "staffPageReadApi.listUsersByIds (最後の引数なし)": [
        "from("users") .select("id, email, created_at, updated_at") .in("id", undefined)",
      ],
      "staffPageReadApi.searchUsersByEmail": [
        "from("users") .select("id, email, role") .ilike("email", "%a1%") .limit(10)",
      ],
      "staffPageReadApi.searchUsersByEmail (最後の引数なし)": [
        "from("users") .select("id, email, role") .ilike("email", "%undefined%") .limit(10)",
      ],
    }
  `) })
  it('公開ページ', async () => { expect(await snapshotModule(publicPage)).toMatchInlineSnapshot(`
    {
      "publicPageReadApi.findActiveOrganizationBySlug": [
        "from("organizations") .select("id, name, slug, contact_email, contact_name") .eq("slug", "a1") .eq("is_active", true) .single()",
      ],
      "publicPageReadApi.findActiveOrganizationBySlug (最後の引数なし)": [
        "from("organizations") .select("id, name, slug, contact_email, contact_name") .eq("slug", undefined) .eq("is_active", true) .single()",
      ],
      "publicPageReadApi.getCommonFaqItems": [
        "from("organizations") .select("common_faq_items") .eq("is_license_manager", true) .limit(1) .maybeSingle()",
      ],
      "publicPageReadApi.getOrganizationFaq": [
        "from("organizations") .select("name, faq_items") .eq("slug", "a1") .single()",
      ],
      "publicPageReadApi.getOrganizationFaq (最後の引数なし)": [
        "from("organizations") .select("name, faq_items") .eq("slug", undefined) .single()",
      ],
      "publicPageReadApi.listActiveOrganizations": [
        "from("organizations") .select("id, slug, name, logo_url") .eq("is_active", true) .order("name")",
      ],
    }
  `) })
  it('予約サイトの申請・承認', async () => { expect(await snapshotModule(bookingSite)).toMatchInlineSnapshot(`
    {
      "bookingSiteRpcApi.apply": [
        "rpc("apply_for_booking_site")",
      ],
      "bookingSiteRpcApi.approve": [
        "rpc("approve_booking_site", {"p_org_id":"a1"})",
      ],
      "bookingSiteRpcApi.approve (最後の引数なし)": [
        "rpc("approve_booking_site", {})",
      ],
      "bookingSiteRpcApi.getPendingApplications": [
        "rpc("get_pending_booking_site_applications")",
      ],
    }
  `) })
})

describe('マイページ・予約確認・クーポン', () => {
  it('マイページ', async () => { expect(await snapshotModule(myPage)).toMatchInlineSnapshot(`
    {
      "myPageDataReadApi.findOwnCustomerByEmail": [
        "from("customers") .select("id, name, nickname, avatar_url, user_id, organization_id") .ilike("email", "a1") .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageDataReadApi.findOwnCustomerByEmail (最後の引数なし)": [
        "from("customers") .select("id, name, nickname, avatar_url, user_id, organization_id") .ilike("email", undefined) .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageDataReadApi.findOwnCustomerByUserId": [
        "from("customers") .select("id, name, nickname, avatar_url, user_id, organization_id") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageDataReadApi.findOwnCustomerByUserId (最後の引数なし)": [
        "from("customers") .select("id, name, nickname, avatar_url, user_id, organization_id") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageDataReadApi.getPrivateGroupSchedules": [
        "rpc("get_private_group_schedules", {"p_group_ids":"a1"})",
      ],
      "myPageDataReadApi.getPrivateGroupSchedules (最後の引数なし)": [
        "rpc("get_private_group_schedules", {})",
      ],
      "myPageDataReadApi.listAvailableScenarios": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, title, org_status") .eq("org_status", "available") .order("title")",
      ],
      "myPageDataReadApi.listOrganizationsByIds": [
        "from("organizations") .select("id, slug, name") .in("id", "a1")",
      ],
      "myPageDataReadApi.listOrganizationsByIds (最後の引数なし)": [
        "from("organizations") .select("id, slug, name") .in("id", undefined)",
      ],
      "myPageDataReadApi.listPublicEventsByIds": [
        "from("schedule_events_public") .select("id, date, start_time, category, is_private_booking, current_participa…) .in("id", "a1")",
      ],
      "myPageDataReadApi.listPublicEventsByIds (最後の引数なし)": [
        "from("schedule_events_public") .select("id, date, start_time, category, is_private_booking, current_participa…) .in("id", undefined)",
      ],
      "myPageDataReadApi.listRatings": [
        "rpc("customer_rating_action", {"p_customer_id":"a1","p_action":"snapshot"})",
      ],
      "myPageDataReadApi.listRatings (最後の引数なし)": [
        "rpc("customer_rating_action", {"p_action":"snapshot"})",
      ],
      "myPageDataReadApi.listRecentReservations": [
        "from("reservations") .select("id, organization_id, reservation_number, title, scenario_id, scenario…) .eq("customer_id", "a1") .order("requested_datetime", {"ascending":false}) .limit(50)",
      ],
      "myPageDataReadApi.listRecentReservations (最後の引数なし)": [
        "from("reservations") .select("id, organization_id, reservation_number, title, scenario_id, scenario…) .eq("customer_id", undefined) .order("requested_datetime", {"ascending":false}) .limit(50)",
      ],
      "myPageDataReadApi.listScenarioMastersByIds": [
        "from("scenario_masters") .select("id, title, key_visual_url, player_count_min, player_count_max") .in("id", "a1")",
      ],
      "myPageDataReadApi.listScenarioMastersByIds (最後の引数なし)": [
        "from("scenario_masters") .select("id, title, key_visual_url, player_count_min, player_count_max") .in("id", undefined)",
      ],
      "myPageDataReadApi.listStores": [
        "from("stores") .select("id, name, short_name, is_temporary") .order("name")",
      ],
      "myPageDataReadApi.listStoresByIds": [
        "from("stores") .select("id, name, address, color") .in("id", "a1")",
      ],
      "myPageDataReadApi.listStoresByIds (最後の引数なし)": [
        "from("stores") .select("id, name, address, color") .in("id", undefined)",
      ],
      "myPageLikesReadApi.findCustomerIdByUserId": [
        "from("customers") .select("id") .eq("user_id", "a1") .maybeSingle()",
      ],
      "myPageLikesReadApi.findCustomerIdByUserId (最後の引数なし)": [
        "from("customers") .select("id") .eq("user_id", undefined) .maybeSingle()",
      ],
      "myPageLikesReadApi.listLikesByCustomer": [
        "from("scenario_likes") .select("id, scenario_id, scenario_master_id, created_at") .eq("customer_id", "a1") .order("created_at", {"ascending":false})",
      ],
      "myPageLikesReadApi.listLikesByCustomer (最後の引数なし)": [
        "from("scenario_likes") .select("id, scenario_id, scenario_master_id, created_at") .eq("customer_id", undefined) .order("created_at", {"ascending":false})",
      ],
      "myPageLikesReadApi.listMastersByIds": [
        "from("scenario_masters") .select("id, title, description, author, official_duration, player_count_min, …) .in("id", "a1")",
      ],
      "myPageLikesReadApi.listMastersByIds (最後の引数なし)": [
        "from("scenario_masters") .select("id, title, description, author, official_duration, player_count_min, …) .in("id", undefined)",
      ],
      "myPageLikesReadApi.listOrganizationSlugs": [
        "from("organizations") .select("id, slug") .in("id", "a1")",
      ],
      "myPageLikesReadApi.listOrganizationSlugs (最後の引数なし)": [
        "from("organizations") .select("id, slug") .in("id", undefined)",
      ],
      "myPageLikesReadApi.listUpcomingPublicEventsForScenarios": [
        "from("schedule_events_public") .select("id, date, start_time, venue, organization_id, scenario_master_id, cur…) .in("scenario_master_id", "a1") .gte("date", "a2") .in("category", ["open","offsite"]) .eq("is_reservation_enabled", true) .order("date", {"ascending":true}) .order("start_time", {"ascending":true}) .limit(1000)",
      ],
      "myPageLikesReadApi.listUpcomingPublicEventsForScenarios (最後の引数なし)": [
        "from("schedule_events_public") .select("id, date, start_time, venue, organization_id, scenario_master_id, cur…) .in("scenario_master_id", "a1") .gte("date", undefined) .in("category", ["open","offsite"]) .eq("is_reservation_enabled", true) .order("date", {"ascending":true}) .order("start_time", {"ascending":true}) .limit(1000)",
      ],
      "myPageProfileReadApi.countBlockingReservations": [
        "from("reservations") .select("id", {"count":"exact","head":true}) .eq("customer_id", "a1") .gte("requested_datetime", "a2") .in("status", ["pending","confirmed","gm_confirmed","pending_gm","pending_store"]) .eq("organization_id", "a3")",
      ],
      "myPageProfileReadApi.countBlockingReservations (最後の引数なし)": [
        "from("reservations") .select("id", {"count":"exact","head":true}) .eq("customer_id", "a1") .gte("requested_datetime", "a2") .in("status", ["pending","confirmed","gm_confirmed","pending_gm","pending_store"])",
      ],
      "myPageProfileReadApi.findOwnCustomer": [
        "from("customers") .select("id, organization_id, user_id, name, nickname, email, phone, address, …) .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageReservationReadApi.findOrganization": [
        "from("organizations") .select("id, slug") .eq("id", "a1") .single()",
      ],
      "myPageReservationReadApi.findOrganization (最後の引数なし)": [
        "from("organizations") .select("id, slug") .eq("id", undefined) .single()",
      ],
      "myPageReservationReadApi.findOrganizationScenarioView": [
        "from("organization_scenarios_with_master") .select("id, title, slug, key_visual_url, duration, player_count_min, player_c…) .eq("id", "a1") .eq("organization_id", "a2") .maybeSingle()",
      ],
      "myPageReservationReadApi.findOrganizationScenarioView (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, slug, key_visual_url, duration, player_count_min, player_c…) .eq("id", "a1") .eq("organization_id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEvent": [
        "from("schedule_events_public") .select("date, start_time, end_time, category, current_participants, max_parti…) .eq("id", "a1") .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEvent (最後の引数なし)": [
        "from("schedule_events_public") .select("date, start_time, end_time, category, current_participants, max_parti…) .eq("id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEventForNotice": [
        "from("schedule_events_public") .select("date, start_time, end_time, scenario, venue, organization_id") .eq("id", "a1") .single()",
      ],
      "myPageReservationReadApi.findPublicEventForNotice (最後の引数なし)": [
        "from("schedule_events_public") .select("date, start_time, end_time, scenario, venue, organization_id") .eq("id", undefined) .single()",
      ],
      "myPageReservationReadApi.findPublicEventSeatCounts": [
        "from("schedule_events_public") .select("current_participants, max_participants") .eq("id", "a1") .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEventSeatCounts (最後の引数なし)": [
        "from("schedule_events_public") .select("current_participants, max_participants") .eq("id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findReservationDetail": [
        "from("reservations") .select("id, reservation_number, title, requested_datetime, participant_count,…) .eq("id", "a1") .maybeSingle()",
      ],
      "myPageReservationReadApi.findReservationDetail (最後の引数なし)": [
        "from("reservations") .select("id, reservation_number, title, requested_datetime, participant_count,…) .eq("id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findReservationSettings": [
        "from("reservation_settings") .select("cancellation_policy, cancellation_deadline_hours, private_cancellatio…) .eq("store_id", "a1") .maybeSingle()",
      ],
      "myPageReservationReadApi.findReservationSettings (最後の引数なし)": [
        "from("reservation_settings") .select("cancellation_policy, cancellation_deadline_hours, private_cancellatio…) .eq("store_id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findScenarioMaster": [
        "from("scenario_masters") .select("id, title, key_visual_url, official_duration, player_count_min, playe…) .eq("id", "a1") .single()",
      ],
      "myPageReservationReadApi.findScenarioMaster (最後の引数なし)": [
        "from("scenario_masters") .select("id, title, key_visual_url, official_duration, player_count_min, playe…) .eq("id", undefined) .single()",
      ],
      "myPageReservationReadApi.findStore": [
        "from("stores") .select("id, name, address") .eq("id", "a1") .single()",
      ],
      "myPageReservationReadApi.findStore (最後の引数なし)": [
        "from("stores") .select("id, name, address") .eq("id", undefined) .single()",
      ],
      "myPageSettingsReadApi.findOwnCustomerId": [
        "from("customers") .select("id") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageSettingsReadApi.findOwnCustomerId (最後の引数なし)": [
        "from("customers") .select("id") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .order("created_at", {"ascending":true}) .order("id", {"ascending":true}) .limit(1) .maybeSingle()",
      ],
      "myPageSettingsReadApi.linkCurrentUserToCustomer": [
        "rpc("link_current_user_to_customer")",
      ],
    }
  `) })
  it('予約確認', async () => { expect(await snapshotModule(bookingConfirmation)).toMatchInlineSnapshot(`
    {
      "bookingConfirmationReadApi.findCustomerProfileByEmail": [
        "from("customers") .select("name, nickname, email, phone") .eq("email", "a1") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findCustomerProfileByEmail (最後の引数なし)": [
        "from("customers") .select("name, nickname, email, phone") .eq("email", undefined) .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findCustomerProfileByUserId": [
        "from("customers") .select("name, nickname, email, phone") .eq("user_id", "a1") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findCustomerProfileByUserId (最後の引数なし)": [
        "from("customers") .select("name, nickname, email, phone") .eq("user_id", undefined) .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findDuplicateByPhone": [
        "from("reservations") .select("id, participant_count, customer_name, customer_phone, reservation_num…) .eq("schedule_event_id", "a1") .eq("customer_phone", "a2") .in("status", ["pending","confirmed","gm_confirmed"]) .limit(1)",
      ],
      "bookingConfirmationReadApi.findDuplicateByPhone (最後の引数なし)": [
        "from("reservations") .select("id, participant_count, customer_name, customer_phone, reservation_num…) .eq("schedule_event_id", "a1") .eq("customer_phone", undefined) .in("status", ["pending","confirmed","gm_confirmed"]) .limit(1)",
      ],
      "bookingConfirmationReadApi.findEventOrganizationId": [
        "from("schedule_events_public") .select("organization_id") .eq("id", "a1") .single()",
      ],
      "bookingConfirmationReadApi.findEventOrganizationId (最後の引数なし)": [
        "from("schedule_events_public") .select("organization_id") .eq("id", undefined) .single()",
      ],
      "bookingConfirmationReadApi.findOwnCustomerPhone": [
        "from("customers") .select("phone") .eq("id", "a1") .eq("user_id", "a2") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findOwnCustomerPhone (最後の引数なし)": [
        "from("customers") .select("phone") .eq("id", "a1") .eq("user_id", undefined) .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findOwnCustomerPhoneInOrganization": [
        "from("customers") .select("phone") .eq("id", "a1") .eq("user_id", "a2") .eq("organization_id", "a3") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findOwnCustomerPhoneInOrganization (最後の引数なし)": [
        "from("customers") .select("phone") .eq("id", "a1") .eq("user_id", "a2") .eq("organization_id", undefined) .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findPublicEventForBooking": [
        "from("schedule_events_public") .select("max_participants, capacity, current_participants, reservation_deadlin…) .eq("id", "a1") .single()",
      ],
      "bookingConfirmationReadApi.findPublicEventForBooking (最後の引数なし)": [
        "from("schedule_events_public") .select("max_participants, capacity, current_participants, reservation_deadlin…) .eq("id", undefined) .single()",
      ],
      "bookingConfirmationReadApi.findPublicEventForConfirmation": [
        "from("schedule_events_public") .select("organization_id, store_id, venue") .eq("id", "a1") .single()",
      ],
      "bookingConfirmationReadApi.findPublicEventForConfirmation (最後の引数なし)": [
        "from("schedule_events_public") .select("organization_id, store_id, venue") .eq("id", undefined) .single()",
      ],
      "bookingConfirmationReadApi.findScenarioPricing": [
        "from("organization_scenarios_with_master") .select("participation_fee, participation_costs") .eq("id", "a1") .eq("organization_id", "a2") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.findScenarioPricing (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("participation_fee, participation_costs") .eq("id", "a1") .maybeSingle()",
      ],
      "bookingConfirmationReadApi.getPerformanceBookingWindow": [
        "rpc("get_performance_booking_window", {"p_event_id":"a1"})",
      ],
      "bookingConfirmationReadApi.getPerformanceBookingWindow (最後の引数なし)": [
        "rpc("get_performance_booking_window", {})",
      ],
      "bookingConfirmationReadApi.getPublicCustomHolidays": [
        "rpc("get_public_custom_holidays", {"p_organization_id":"a1"})",
      ],
      "bookingConfirmationReadApi.getPublicCustomHolidays (最後の引数なし)": [
        "rpc("get_public_custom_holidays", {})",
      ],
      "bookingConfirmationReadApi.getPublicPaymentSettings": [
        "rpc("get_public_payment_settings", {"p_organization_slug":"a1","p_event_id":"a2"})",
      ],
      "bookingConfirmationReadApi.getPublicPaymentSettings (最後の引数なし)": [
        "rpc("get_public_payment_settings", {"p_organization_slug":"a1"})",
      ],
      "bookingConfirmationReadApi.listDuplicateByEmail": [
        "from("reservations") .select("id, participant_count, customer_name, customer_email, reservation_num…) .eq("schedule_event_id", "a1") .in("status", ["pending","confirmed","gm_confirmed"]) .eq("customer_email", "a2") .limit(1)",
      ],
      "bookingConfirmationReadApi.listDuplicateByEmail (最後の引数なし)": [
        "from("reservations") .select("id, participant_count, customer_name, customer_email, reservation_num…) .eq("schedule_event_id", "a1") .in("status", ["pending","confirmed","gm_confirmed"]) .limit(1)",
      ],
      "bookingConfirmationReadApi.listSameEmailOtherEventReservations": [
        "from("reservations") .select("\\n        id, \\n        participant_count, \\n        customer_name, \\…) .eq("customer_email", "a1") .in("status", ["pending","confirmed","gm_confirmed"]) .neq("schedule_event_id", "a2")",
      ],
      "bookingConfirmationReadApi.listSameEmailOtherEventReservations (最後の引数なし)": [
        "from("reservations") .select("\\n        id, \\n        participant_count, \\n        customer_name, \\…) .eq("customer_email", "a1") .in("status", ["pending","confirmed","gm_confirmed"]) .neq("schedule_event_id", undefined)",
      ],
    }
  `) })
  it('クーポン', async () => { expect(await snapshotModule(couponPage)).toMatchInlineSnapshot(`
    {
      "couponPageReadApi.findCustomerByUserId": [
        "from("customers") .select("id, name") .eq("user_id", "a1") .maybeSingle()",
      ],
      "couponPageReadApi.findCustomerByUserId (最後の引数なし)": [
        "from("customers") .select("id, name") .eq("user_id", undefined) .maybeSingle()",
      ],
      "couponPageReadApi.listActiveCoupons": [
        "from("customer_coupons") .select("\\n        id,\\n        uses_remaining,\\n        expires_at,\\n        …) .eq("customer_id", "a1") .eq("status", "active") .order("created_at", {"ascending":false})",
      ],
      "couponPageReadApi.listActiveCoupons (最後の引数なし)": [
        "from("customer_coupons") .select("\\n        id,\\n        uses_remaining,\\n        expires_at,\\n        …) .eq("customer_id", undefined) .eq("status", "active") .order("created_at", {"ascending":false})",
      ],
    }
  `) })
})

describe('GM 空き確認・プロフィール登録・ライセンス・プラットフォーム・報告フォーム', () => {
  it('GM 空き確認', async () => { expect(await snapshotModule(gmAvailability)).toMatchInlineSnapshot(`
    {
      "gmAvailabilityReadApi.findReservationStatus": [
        "from("reservations") .select("status") .eq("id", "a1") .maybeSingle()",
      ],
      "gmAvailabilityReadApi.findReservationStatus (最後の引数なし)": [
        "from("reservations") .select("status") .eq("id", undefined) .maybeSingle()",
      ],
      "gmAvailabilityReadApi.listConfirmedPrivateByStore": [
        "from("reservations") .select("candidate_datetimes, store_id") .eq("reservation_source", "web_private") .in("status", ["confirmed","gm_confirmed"]) .eq("store_id", "a1")",
      ],
      "gmAvailabilityReadApi.listConfirmedPrivateByStore (最後の引数なし)": [
        "from("reservations") .select("candidate_datetimes, store_id") .eq("reservation_source", "web_private") .in("status", ["confirmed","gm_confirmed"]) .eq("store_id", undefined)",
      ],
      "gmAvailabilityReadApi.listGmEventsOnDates": [
        "from("schedule_events_staff_view") .select("date, start_time, end_time, gms") .in("date", "a1") .eq("is_cancelled", false) .contains("gms", ["a2"])",
      ],
      "gmAvailabilityReadApi.listGmEventsOnDates (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("date, start_time, end_time, gms") .in("date", "a1") .eq("is_cancelled", false) .contains("gms", [null])",
      ],
      "gmAvailabilityReadApi.listStaffViewEventsOnDate": [
        "from("schedule_events_staff_view") .select("start_time, end_time") .eq("date", "a1") .eq("store_id", "a2") .eq("is_cancelled", false)",
      ],
      "gmAvailabilityReadApi.listStaffViewEventsOnDate (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("start_time, end_time") .eq("date", "a1") .eq("store_id", undefined) .eq("is_cancelled", false)",
      ],
    }
  `) })
  it('プロフィール登録', async () => { expect(await snapshotModule(completeProfile)).toMatchInlineSnapshot(`
    {
      "completeProfileReadApi.findCustomerByEmail": [
        "from("customers") .select("id, user_id") .eq("email", "a1") .maybeSingle()",
      ],
      "completeProfileReadApi.findCustomerByEmail (最後の引数なし)": [
        "from("customers") .select("id, user_id") .eq("email", undefined) .maybeSingle()",
      ],
      "completeProfileReadApi.findOrganizationSlug": [
        "from("organizations") .select("slug") .eq("id", "a1") .maybeSingle()",
      ],
      "completeProfileReadApi.findOrganizationSlug (最後の引数なし)": [
        "from("organizations") .select("slug") .eq("id", undefined) .maybeSingle()",
      ],
      "completeProfileReadApi.findUserRoleAndOrganization": [
        "from("users") .select("role, organization_id") .eq("id", "a1") .maybeSingle()",
      ],
      "completeProfileReadApi.findUserRoleAndOrganization (最後の引数なし)": [
        "from("users") .select("role, organization_id") .eq("id", undefined) .maybeSingle()",
      ],
      "completeProfileReadApi.isEmailLinkedToOtherUser": [
        "rpc("is_customer_email_linked_to_other_user", {"p_email":"a1"})",
      ],
      "completeProfileReadApi.isEmailLinkedToOtherUser (最後の引数なし)": [
        "rpc("is_customer_email_linked_to_other_user", {})",
      ],
      "completeProfileReadApi.listCustomersByEmailLinkedToOthers": [
        "from("customers") .select("id, user_id") .eq("email", "a1") .neq("user_id", "a2") .maybeSingle()",
      ],
      "completeProfileReadApi.listCustomersByEmailLinkedToOthers (最後の引数なし)": [
        "from("customers") .select("id, user_id") .eq("email", "a1") .neq("user_id", undefined) .maybeSingle()",
      ],
      "completeProfileReadApi.listOwnCustomerIdsLatestFirst": [
        "from("customers") .select("id") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomerIdsLatestFirst (最後の引数なし)": [
        "from("customers") .select("id") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomerIdsOldestFirst": [
        "from("customers") .select("id") .eq("user_id", "a1") .order("created_at", {"ascending":true}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomerIdsOldestFirst (最後の引数なし)": [
        "from("customers") .select("id") .eq("user_id", undefined) .order("created_at", {"ascending":true}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomersForVerify": [
        "from("customers") .select("id, name, phone, email, updated_at") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomersForVerify (最後の引数なし)": [
        "from("customers") .select("id, name, phone, email, updated_at") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomersLatestFirst": [
        "from("customers") .select("id, name, phone, email") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .limit(1)",
      ],
      "completeProfileReadApi.listOwnCustomersLatestFirst (最後の引数なし)": [
        "from("customers") .select("id, name, phone, email") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .limit(1)",
      ],
    }
  `) })
  it('ライセンス報告', async () => { expect(await snapshotModule(licenseReport)).toMatchInlineSnapshot(`
    {
      "licenseReportReadApi.getPartnerReportForm": [
        "rpc("get_license_partner_report_form", {"p_token":"a1","p_year":"a2","p_month":"a3"})",
      ],
      "licenseReportReadApi.getPartnerReportForm (最後の引数なし)": [
        "rpc("get_license_partner_report_form", {"p_token":"a1","p_year":"a2"})",
      ],
      "licenseReportReadApi.listManualExternalPerformances": [
        "from("manual_external_performances") .select("scenario_id, performance_count, performance_type") .eq("year", "a1") .eq("month", "a2")",
      ],
      "licenseReportReadApi.listManualExternalPerformances (最後の引数なし)": [
        "from("manual_external_performances") .select("scenario_id, performance_count, performance_type") .eq("year", "a1") .eq("month", undefined)",
      ],
      "licenseReportReadApi.listManualInternalOverrides": [
        "from("manual_internal_performance_overrides") .select("scenario_key, performance_count") .eq("organization_id", "a1") .eq("year", "a2") .eq("month", "a3")",
      ],
      "licenseReportReadApi.listManualInternalOverrides (最後の引数なし)": [
        "from("manual_internal_performance_overrides") .select("scenario_key, performance_count") .eq("organization_id", "a1") .eq("year", "a2") .eq("month", undefined)",
      ],
      "licenseReportReadApi.listReportHistory": [
        "from("license_report_history") .select("author_name, sent_at, total_events, total_license_cost, email_body, s…) .eq("year", "a1") .eq("month", "a2")",
      ],
      "licenseReportReadApi.listReportHistory (最後の引数なし)": [
        "from("license_report_history") .select("author_name, sent_at, total_events, total_license_cost, email_body, s…) .eq("year", "a1") .eq("month", undefined)",
      ],
      "licenseReportRpcApi.submitPartnerMonthlyReport": [
        "rpc("submit_license_partner_monthly_report", "a1")",
      ],
      "licenseReportRpcApi.submitPartnerMonthlyReport (最後の引数なし)": [
        "rpc("submit_license_partner_monthly_report")",
      ],
      "licenseReportRpcApi.upsertManualExternalPerformance": [
        "rpc("upsert_manual_external_performance", "a1")",
      ],
      "licenseReportRpcApi.upsertManualExternalPerformance (最後の引数なし)": [
        "rpc("upsert_manual_external_performance")",
      ],
      "licenseReportRpcApi.upsertManualInternalPerformanceOverride": [
        "rpc("upsert_manual_internal_performance_override", "a1")",
      ],
      "licenseReportRpcApi.upsertManualInternalPerformanceOverride (最後の引数なし)": [
        "rpc("upsert_manual_internal_performance_override")",
      ],
    }
  `) })
  it('プラットフォーム', async () => { expect(await snapshotModule(platformPage)).toMatchInlineSnapshot(`
    {
      "platformPageReadApi.getAllPublicCategories": [
        "rpc("get_all_public_categories")",
      ],
      "platformPageReadApi.getAllPublicStores": [
        "rpc("get_all_public_stores")",
      ],
      "platformPageReadApi.getPublicAvailableScenarioKeys": [
        "rpc("get_public_available_scenario_keys")",
      ],
      "platformPageReadApi.listActiveOrganizations": [
        "from("organizations") .select("id, slug, name, logo_url") .eq("is_active", true) .order("name")",
      ],
      "platformPageReadApi.listActiveStores": [
        "from("stores") .select("id, name, short_name, region, address, organization_id") .eq("status", "active") .or("is_temporary.is.null,is_temporary.eq.false") .neq("ownership_type", "office") .order("region", {"ascending":true}) .order("name", {"ascending":true})",
      ],
      "platformPageReadApi.listApprovedMasterIds": [
        "from("scenario_masters") .select("id") .eq("master_status", "approved")",
      ],
      "platformPageReadApi.listAvailableScenarioViews": [
        "from("organization_scenarios_with_master") .select("\\n        id, org_scenario_id, slug, title, author, key_visual_url,\\n…) .eq("status", "available") .order("title")",
      ],
      "platformPageReadApi.listLatestPublishedBlogPosts": [
        "from("blog_posts") .select("id, title, slug, excerpt, cover_image_url, published_at, organization…) .eq("is_published", true) .order("published_at", {"ascending":false}) .limit(3)",
      ],
      "platformPageReadApi.listOrganizationScenarioSlugs": [
        "from("organization_scenarios") .select("scenario_master_id, slug") .not("slug", "is", null)",
      ],
      "platformPageReadApi.listRecentReservationsSince": [
        "from("reservations") .select("schedule_event_id, participant_count, status") .gte("created_at", "a1") .in("status", ["confirmed","pending","checked_in"])",
      ],
      "platformPageReadApi.listRecentReservationsSince (最後の引数なし)": [
        "from("reservations") .select("schedule_event_id, participant_count, status") .gte("created_at", undefined) .in("status", ["confirmed","pending","checked_in"])",
      ],
      "platformPageReadApi.listUpcomingOpenEvents": [
        "from("schedule_events") .select("id, date, start_time, current_participants, max_participants, organiz…) .gte("date", "a1") .in("category", ["open","offsite"]) .eq("is_cancelled", false) .eq("is_reservation_enabled", true) .order("date", {"ascending":true}) .limit(200)",
      ],
      "platformPageReadApi.listUpcomingOpenEvents (最後の引数なし)": [
        "from("schedule_events") .select("id, date, start_time, current_participants, max_participants, organiz…) .gte("date", undefined) .in("category", ["open","offsite"]) .eq("is_cancelled", false) .eq("is_reservation_enabled", true) .order("date", {"ascending":true}) .limit(200)",
      ],
    }
  `) })
  it('報告フォーム・ユーザーの役割・組織登録', async () => {
    expect({ ...(await snapshotModule(reportForm)), ...(await snapshotModule(userRole)), ...(await snapshotModule(orgSignup)) }).toMatchInlineSnapshot(`
      {
        "orgSignupRpcApi.claimAsAdmin": [
          "rpc("claim_organization_as_admin_v2", "a1")",
        ],
        "orgSignupRpcApi.claimAsAdmin (最後の引数なし)": [
          "rpc("claim_organization_as_admin_v2")",
        ],
        "orgSignupRpcApi.registerOrganization": [
          "rpc("register_organization_for_signup", "a1")",
        ],
        "orgSignupRpcApi.registerOrganization (最後の引数なし)": [
          "rpc("register_organization_for_signup")",
        ],
        "orgSignupRpcApi.rollbackOrphan": [
          "rpc("rollback_orphan_organization_v2", {"p_org_id":"a1","p_claim_token":"a2"})",
        ],
        "orgSignupRpcApi.rollbackOrphan (最後の引数なし)": [
          "rpc("rollback_orphan_organization_v2", {"p_org_id":"a1"})",
        ],
        "reportFormReadApi.listExternalLicenseAmounts": [
          "from("organization_scenarios") .select("id, external_license_amount") .in("id", "a1")",
        ],
        "reportFormReadApi.listExternalLicenseAmounts (最後の引数なし)": [
          "from("organization_scenarios") .select("id, external_license_amount") .in("id", undefined)",
        ],
        "reportFormReadApi.listManagedAvailableScenarios": [
          "from("organization_scenarios_with_master") .select("id, title, author, license_amount") .eq("scenario_type", "managed") .eq("status", "available") .order("author") .order("title")",
        ],
        "reportFormReadApi.listManagedAvailableScenariosOfOrganization": [
          "from("organization_scenarios_with_master") .select("id, org_scenario_id, scenario_master_id, title, author") .eq("organization_id", "a1") .eq("scenario_type", "managed") .eq("status", "available") .order("author") .order("title")",
        ],
        "reportFormReadApi.listManagedAvailableScenariosOfOrganization (最後の引数なし)": [
          "from("organization_scenarios_with_master") .select("id, org_scenario_id, scenario_master_id, title, author") .eq("organization_id", undefined) .eq("scenario_type", "managed") .eq("status", "available") .order("author") .order("title")",
        ],
        "userRoleReadApi.findRoleById": [
          "from("users") .select("role") .eq("id", "a1") .single()",
        ],
        "userRoleReadApi.findRoleById (最後の引数なし)": [
          "from("users") .select("role") .eq("id", undefined) .single()",
        ],
      }
    `)
  })
})

describe('貸切・デモ・予約サイト・売上・シナリオ・スケジュール管理', () => {
  it('デモ参加者の追加', async () => { expect(await snapshotModule(demoParticipants)).toMatchInlineSnapshot(`
    {
      "demoParticipantsReadApi.adminDeleteReservationsByIds": [
        "rpc("admin_delete_reservations_by_ids", "a1")",
      ],
      "demoParticipantsReadApi.adminDeleteReservationsByIds (最後の引数なし)": [
        "rpc("admin_delete_reservations_by_ids")",
      ],
      "demoParticipantsReadApi.findDemoCustomer": [
        "from("customers") .select("id, name, email") .or("name.ilike.%デモ%,email.ilike.%demo%,name.ilike.%test%") .eq("organization_id", "a1") .limit(1) .single()",
      ],
      "demoParticipantsReadApi.findDemoCustomer (最後の引数なし)": [
        "from("customers") .select("id, name, email") .or("name.ilike.%デモ%,email.ilike.%demo%,name.ilike.%test%") .limit(1) .single()",
      ],
      "demoParticipantsReadApi.findScenarioById": [
        "from("organization_scenarios_with_master") .select("id, title, duration, participation_fee, gm_test_participation_fee, pa…) .eq("id", "a1") .eq("organization_id", "a2") .maybeSingle()",
      ],
      "demoParticipantsReadApi.findScenarioById (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, duration, participation_fee, gm_test_participation_fee, pa…) .eq("id", "a1") .maybeSingle()",
      ],
      "demoParticipantsReadApi.findStoreIdByVenueName": [
        "from("stores") .select("id") .or("name.eq.a1,short_name.eq.a1") .single()",
      ],
      "demoParticipantsReadApi.findStoreIdByVenueName (最後の引数なし)": [
        "from("stores") .select("id") .or("name.eq.undefined,short_name.eq.undefined") .single()",
      ],
      "demoParticipantsReadApi.listActiveReservationsByEvent": [
        "from("reservations") .select("id, participant_names, reservation_source, participant_count") .eq("schedule_event_id", "a1") .in("status", ["confirmed","pending"])",
      ],
      "demoParticipantsReadApi.listActiveReservationsByEvent (最後の引数なし)": [
        "from("reservations") .select("id, participant_names, reservation_source, participant_count") .eq("schedule_event_id", undefined) .in("status", ["confirmed","pending"])",
      ],
      "demoParticipantsReadApi.listCustomersSample": [
        "from("customers") .select("id, name, email") .eq("organization_id", "a1") .limit(10)",
      ],
      "demoParticipantsReadApi.listCustomersSample (最後の引数なし)": [
        "from("customers") .select("id, name, email") .limit(10)",
      ],
      "demoParticipantsReadApi.listMasterTitlesLike": [
        "from("scenario_masters") .select("title") .ilike("title", "%a1%") .limit(3)",
      ],
      "demoParticipantsReadApi.listMasterTitlesLike (最後の引数なし)": [
        "from("scenario_masters") .select("title") .ilike("title", "%undefined%") .limit(3)",
      ],
      "demoParticipantsReadApi.listPastEvents": [
        "from("schedule_events_staff_view") .select("id, date, venue, scenario, scenario_master_id, gms, start_time, end_t…) .lte("date", "a1") .eq("is_cancelled", false) .eq("organization_id", "a2") .order("date", {"ascending":false})",
      ],
      "demoParticipantsReadApi.listPastEvents (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id, date, venue, scenario, scenario_master_id, gms, start_time, end_t…) .lte("date", "a1") .eq("is_cancelled", false) .order("date", {"ascending":false})",
      ],
      "demoParticipantsReadApi.listScenarios": [
        "from("organization_scenarios_with_master") .select("id, title, duration, participation_fee, gm_test_participation_fee, pa…) .eq("organization_id", "a1")",
      ],
      "demoParticipantsReadApi.listScenarios (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, duration, participation_fee, gm_test_participation_fee, pa…)",
      ],
      "demoParticipantsReadApi.pingCustomers": [
        "from("customers") .select("count") .limit(1)",
      ],
    }
  `) })
  it('貸切管理', async () => { expect(await snapshotModule(privateBookingMgmt)).toMatchInlineSnapshot(`
    {
      "privateBookingMgmtReadApi.findBlockedSlot": [
        "from("schedule_blocked_slots") .select("id") .filter("organization_id", "eq", "a1") .eq("date", "a2") .eq("store_id", "a3") .eq("time_slot", "a4") .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findBlockedSlot (最後の引数なし)": [
        "from("schedule_blocked_slots") .select("id") .filter("organization_id", "eq", "a1") .eq("date", "a2") .eq("store_id", "a3") .eq("time_slot", undefined) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findRequestSummary": [
        "from("reservations") .select("store_id, organization_id, title, customer_name") .eq("organization_id", "a1") .eq("id", "a2") .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findRequestSummary (最後の引数なし)": [
        "from("reservations") .select("store_id, organization_id, title, customer_name") .eq("organization_id", "a1") .eq("id", undefined) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findReservationForReadiness": [
        "from("reservations") .select("id, organization_id, scenario_master_id, candidate_datetimes") .eq("id", "a1") .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findReservationForReadiness (最後の引数なし)": [
        "from("reservations") .select("id, organization_id, scenario_master_id, candidate_datetimes") .eq("id", undefined) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findReservationStoreAndOrganization": [
        "from("reservations") .select("store_id, organization_id") .eq("id", "a1") .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findReservationStoreAndOrganization (最後の引数なし)": [
        "from("reservations") .select("store_id, organization_id") .eq("id", undefined) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findScenarioGmCount": [
        "from("organization_scenarios_with_master") .select("gm_count") .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findScenarioGmCount (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("gm_count") .eq("scenario_master_id", "a1") .eq("organization_id", undefined) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findScenarioStoresView": [
        "from("organization_scenarios_with_master") .select("available_stores, scenario_master_id") .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .limit(1) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findScenarioStoresView (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("available_stores, scenario_master_id") .eq("scenario_master_id", "a1") .eq("organization_id", undefined) .limit(1) .maybeSingle()",
      ],
      "privateBookingMgmtReadApi.findStaffIdByUserId": [
        "from("staff") .select("id") .eq("user_id", "a1") .single()",
      ],
      "privateBookingMgmtReadApi.findStaffIdByUserId (最後の引数なし)": [
        "from("staff") .select("id") .eq("user_id", undefined) .single()",
      ],
      "privateBookingMgmtReadApi.listActiveStaffByIds": [
        "from("staff") .select("id") .eq("organization_id", "a1") .eq("status", "active") .in("id", "a2")",
      ],
      "privateBookingMgmtReadApi.listActiveStaffByIds (最後の引数なし)": [
        "from("staff") .select("id") .eq("organization_id", "a1") .eq("status", "active") .in("id", undefined)",
      ],
      "privateBookingMgmtReadApi.listApplicantChanges": [
        "from("private_group_handover_requests") .select("id, reservation_id, responded_at, previous_customer, accepted_contact…) .filter("organization_id", "eq", "a1") .in("reservation_id", "a2") .eq("status", "accepted") .order("responded_at", {"ascending":true})",
      ],
      "privateBookingMgmtReadApi.listApplicantChanges (最後の引数なし)": [
        "from("private_group_handover_requests") .select("id, reservation_id, responded_at, previous_customer, accepted_contact…) .filter("organization_id", "eq", "a1") .in("reservation_id", undefined) .eq("status", "accepted") .order("responded_at", {"ascending":true})",
      ],
      "privateBookingMgmtReadApi.listAssignedScenarioIds": [
        "from("staff_scenario_assignments") .select("scenario_master_id") .eq("staff_id", "a1")",
      ],
      "privateBookingMgmtReadApi.listAssignedScenarioIds (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("scenario_master_id") .eq("staff_id", undefined)",
      ],
      "privateBookingMgmtReadApi.listBlockedSlotsOnDates": [
        "from("schedule_blocked_slots") .select("date, store_id, time_slot, created_at") .filter("organization_id", "eq", "a1") .in("date", "a2")",
      ],
      "privateBookingMgmtReadApi.listBlockedSlotsOnDates (最後の引数なし)": [
        "from("schedule_blocked_slots") .select("date, store_id, time_slot, created_at") .filter("organization_id", "eq", "a1") .in("date", undefined)",
      ],
      "privateBookingMgmtReadApi.listConfirmedPrivateWithoutEvent": [
        "from("reservations") .select("id,store_id,gm_staff,scenario_master_id,candidate_datetimes") .eq("organization_id", "a1") .eq("status", "confirmed") .is("schedule_event_id", null) .order("id") .range("a2", "a2499")",
      ],
      "privateBookingMgmtReadApi.listConfirmedPrivateWithoutEvent (最後の引数なし)": [
        "from("reservations") .select("id,store_id,gm_staff,scenario_master_id,candidate_datetimes") .eq("organization_id", "a1") .eq("status", "confirmed") .is("schedule_event_id", null) .order("id") .range(undefined, null)",
      ],
      "privateBookingMgmtReadApi.listEventsByIds": [
        "from("schedule_events") .select("id, date, start_time, end_time, store_id, is_cancelled, gms") .eq("organization_id", "a1") .in("id", "a2")",
      ],
      "privateBookingMgmtReadApi.listEventsByIds (最後の引数なし)": [
        "from("schedule_events") .select("id, date, start_time, end_time, store_id, is_cancelled, gms") .eq("organization_id", "a1") .in("id", undefined)",
      ],
      "privateBookingMgmtReadApi.listEventsForConflicts": [
        "from("schedule_events_staff_view") .select("id,date,start_time,end_time,store_id,reservation_id,scenario_master_i…) .eq("organization_id", "a1") .eq("is_cancelled", false) .gte("date", "a2") .lte("date", "a3") .order("id") .range("a4", "a4499")",
      ],
      "privateBookingMgmtReadApi.listEventsForConflicts (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id,date,start_time,end_time,store_id,reservation_id,scenario_master_i…) .eq("organization_id", "a1") .eq("is_cancelled", false) .gte("date", "a2") .lte("date", "a3") .order("id") .range(undefined, null)",
      ],
      "privateBookingMgmtReadApi.listExistingEvents": [
        "from("schedule_events_staff_view") .select("id, scenario, start_time, end_time, reservation_id") .eq("date", "a1") .eq("store_id", "a2") .neq("is_cancelled", true)",
      ],
      "privateBookingMgmtReadApi.listExistingEvents (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id, scenario, start_time, end_time, reservation_id") .eq("date", "a1") .eq("store_id", undefined) .neq("is_cancelled", true)",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByScenario": [
        "from("staff_scenario_assignments") .select("staff_id") .eq("scenario_master_id", "a1") .or("can_main_gm.eq.true,can_sub_gm.eq.true")",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByScenario (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("staff_id") .eq("scenario_master_id", undefined) .or("can_main_gm.eq.true,can_sub_gm.eq.true")",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByScenarios": [
        "from("staff_scenario_assignments") .select("organization_id, staff_id, scenario_master_id, can_main_gm, can_sub_g…) .in("scenario_master_id", "a1") .order("staff_id") .order("scenario_master_id") .range("a2", "a3")",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByScenarios (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("organization_id, staff_id, scenario_master_id, can_main_gm, can_sub_g…) .in("scenario_master_id", "a1") .order("staff_id") .order("scenario_master_id") .range("a2", undefined)",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByStaffIds": [
        "from("staff_scenario_assignments") .select("staff_id, can_main_gm, can_sub_gm") .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .in("staff_id", "a3")",
      ],
      "privateBookingMgmtReadApi.listGmAssignmentsByStaffIds (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("staff_id, can_main_gm, can_sub_gm") .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .in("staff_id", undefined)",
      ],
      "privateBookingMgmtReadApi.listPrivateReservationsByIds": [
        "from("reservations") .select("id, private_group_id, schedule_event_id, status") .eq("organization_id", "a1") .in("id", "a2") .eq("reservation_source", "web_private")",
      ],
      "privateBookingMgmtReadApi.listPrivateReservationsByIds (最後の引数なし)": [
        "from("reservations") .select("id, private_group_id, schedule_event_id, status") .eq("organization_id", "a1") .in("id", undefined) .eq("reservation_source", "web_private")",
      ],
      "privateBookingMgmtReadApi.listReservationsByGroupIds": [
        "from("reservations") .select("id, private_group_id, reservation_number") .eq("organization_id", "a1") .in("private_group_id", "a2") .order("id") .range("a3", "a4")",
      ],
      "privateBookingMgmtReadApi.listReservationsByGroupIds (最後の引数なし)": [
        "from("reservations") .select("id, private_group_id, reservation_number") .eq("organization_id", "a1") .in("private_group_id", "a2") .order("id") .range("a3", undefined)",
      ],
      "privateBookingMgmtReadApi.listScenarioViewsForRequests": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, gm_count, player_count_min, player_count_max, dur…) .eq("organization_id", "a1") .in("scenario_master_id", "a2") .order("scenario_master_id") .range("a3", "a4")",
      ],
      "privateBookingMgmtReadApi.listScenarioViewsForRequests (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, gm_count, player_count_min, player_count_max, dur…) .eq("organization_id", "a1") .in("scenario_master_id", "a2") .order("scenario_master_id") .range("a3", undefined)",
      ],
      "privateBookingMgmtReadApi.listStoresByIds": [
        "from("stores") .select("id, name, short_name") .eq("organization_id", "a1") .in("id", "a2")",
      ],
      "privateBookingMgmtReadApi.listStoresByIds (最後の引数なし)": [
        "from("stores") .select("id, name, short_name") .eq("organization_id", "a1") .in("id", undefined)",
      ],
      "privateBookingMgmtRpcApi.approveWithNotifications": [
        "rpc("approve_private_booking_with_notifications", "a1")",
      ],
      "privateBookingMgmtRpcApi.approveWithNotifications (最後の引数なし)": [
        "rpc("approve_private_booking_with_notifications")",
      ],
      "privateBookingMgmtRpcApi.deleteRequestAtomic": [
        "rpc("delete_private_booking_request_atomic", {"p_reservation_id":"a1"})",
      ],
      "privateBookingMgmtRpcApi.deleteRequestAtomic (最後の引数なし)": [
        "rpc("delete_private_booking_request_atomic", {})",
      ],
      "privateBookingMgmtRpcApi.getApprovalDeliveryStatus": [
        "rpc("get_private_booking_approval_delivery_status", {"p_reservation_ids":"a1"})",
      ],
      "privateBookingMgmtRpcApi.getApprovalDeliveryStatus (最後の引数なし)": [
        "rpc("get_private_booking_approval_delivery_status", {})",
      ],
      "privateBookingMgmtRpcApi.getDeliveryHistory": [
        "rpc("get_private_booking_delivery_history", {"p_reservation_id":"a1"})",
      ],
      "privateBookingMgmtRpcApi.getDeliveryHistory (最後の引数なし)": [
        "rpc("get_private_booking_delivery_history", {})",
      ],
      "privateBookingMgmtRpcApi.getRejectionDeliveryStatus": [
        "rpc("get_private_rejection_delivery_status", {"p_reservation_ids":"a1"})",
      ],
      "privateBookingMgmtRpcApi.getRejectionDeliveryStatus (最後の引数なし)": [
        "rpc("get_private_rejection_delivery_status", {})",
      ],
      "privateBookingMgmtRpcApi.resumeApprovalPreparation": [
        "rpc("resume_private_approval_preparation", {"p_delivery_id":"a1"})",
      ],
      "privateBookingMgmtRpcApi.resumeApprovalPreparation (最後の引数なし)": [
        "rpc("resume_private_approval_preparation", {})",
      ],
      "privateBookingMgmtRpcApi.retryRejectionDelivery": [
        "rpc("retry_private_rejection_delivery", {"p_reservation_id":"a1"})",
      ],
      "privateBookingMgmtRpcApi.retryRejectionDelivery (最後の引数なし)": [
        "rpc("retry_private_rejection_delivery", {})",
      ],
      "privateBookingMgmtRpcApi.retryUnsentDelivery": [
        "rpc("retry_private_unsent_delivery", {"p_kind":"a1","p_delivery_id":"a2"})",
      ],
      "privateBookingMgmtRpcApi.retryUnsentDelivery (最後の引数なし)": [
        "rpc("retry_private_unsent_delivery", {"p_kind":"a1"})",
      ],
      "privateBookingMgmtRpcApi.sendStaffGroupMessage": [
        "rpc("send_staff_group_message", "a1")",
      ],
      "privateBookingMgmtRpcApi.sendStaffGroupMessage (最後の引数なし)": [
        "rpc("send_staff_group_message")",
      ],
      "privateBookingRequestReadApi.listRequestsPage": [
        "from("reservations") .select("\\n        id, reservation_number, scenario_master_id, private_group_i…) .eq("organization_id", "a1") .eq("reservation_source", "web_private") .order("created_at", {"ascending":false}) .order("id", {"ascending":false}) .in("scenario_master_id", "a2") .in("status", "a3") .range("a4", "a5")",
      ],
      "privateBookingRequestReadApi.listRequestsPage (最後の引数なし)": [
        "from("reservations") .select("\\n        id, reservation_number, scenario_master_id, private_group_i…) .eq("organization_id", "a1") .eq("reservation_source", "web_private") .order("created_at", {"ascending":false}) .order("id", {"ascending":false}) .in("scenario_master_id", "a2") .in("status", "a3") .range("a4", undefined)",
      ],
    }
  `) })
  it('貸切リクエスト', async () => { expect(await snapshotModule(privateBookingRequest)).toMatchInlineSnapshot(`
    {
      "privateBookingRequestReadApi.listAvailabilityEvents": [
        "from("schedule_events_for_availability") .select("id, date, store_id, start_time, end_time, is_cancelled") .filter("organization_id", "eq", "a1") .in("store_id", "a2") .gte("date", "a3") .lte("date", "a4") .eq("is_cancelled", false)",
      ],
      "privateBookingRequestReadApi.listAvailabilityEvents (最後の引数なし)": [
        "from("schedule_events_for_availability") .select("id, date, store_id, start_time, end_time, is_cancelled") .filter("organization_id", "eq", "a1") .in("store_id", "a2") .gte("date", "a3") .lte("date", undefined) .eq("is_cancelled", false)",
      ],
      "privateBookingRequestReadApi.listAvailabilityEventsForSlots": [
        "from("schedule_events_for_availability") .select("id, date, start_time, end_time, store_id, is_cancelled") .filter("organization_id", "eq", "a1") .in("store_id", "a2") .gte("date", "a3") .lte("date", "a4") .eq("is_cancelled", false)",
      ],
      "privateBookingRequestReadApi.listAvailabilityEventsForSlots (最後の引数なし)": [
        "from("schedule_events_for_availability") .select("id, date, start_time, end_time, store_id, is_cancelled") .filter("organization_id", "eq", "a1") .in("store_id", "a2") .gte("date", "a3") .lte("date", undefined) .eq("is_cancelled", false)",
      ],
      "privateBookingRequestReadApi.listPublicEventsOnDate": [
        "from("schedule_events_public") .select("id, date, start_time, end_time, store_id, scenario, category, is_canc…) .in("store_id", "a1") .eq("date", "a2") .eq("is_cancelled", false)",
      ],
      "privateBookingRequestReadApi.listPublicEventsOnDate (最後の引数なし)": [
        "from("schedule_events_public") .select("id, date, start_time, end_time, store_id, scenario, category, is_canc…) .in("store_id", "a1") .eq("date", undefined) .eq("is_cancelled", false)",
      ],
    }
  `) })
  it('貸切グループ', async () => { expect(await snapshotModule(privateGroupPage)).toMatchInlineSnapshot(`
    {
      "privateGroupPageReadApi.findOrganizationContact": [
        "from("organizations") .select("id, name, contact_email") .eq("id", "a1") .single()",
      ],
      "privateGroupPageReadApi.findOrganizationContact (最後の引数なし)": [
        "from("organizations") .select("id, name, contact_email") .eq("id", undefined) .single()",
      ],
      "privateGroupPageReadApi.findOrganizationContactEmail": [
        "from("organizations") .select("contact_email") .eq("id", "a1") .single()",
      ],
      "privateGroupPageReadApi.findOrganizationContactEmail (最後の引数なし)": [
        "from("organizations") .select("contact_email") .eq("id", undefined) .single()",
      ],
      "privateGroupPageReadApi.findOrganizationSlug": [
        "from("organizations") .select("slug") .eq("id", "a1") .maybeSingle()",
      ],
      "privateGroupPageReadApi.findOrganizationSlug (最後の引数なし)": [
        "from("organizations") .select("slug") .eq("id", undefined) .maybeSingle()",
      ],
      "privateGroupPageReadApi.findOwnCustomerPhone": [
        "from("customers") .select("phone") .eq("user_id", "a1") .order("updated_at", {"ascending":false}) .limit(1) .maybeSingle()",
      ],
      "privateGroupPageReadApi.findOwnCustomerPhone (最後の引数なし)": [
        "from("customers") .select("phone") .eq("user_id", undefined) .order("updated_at", {"ascending":false}) .limit(1) .maybeSingle()",
      ],
      "privateGroupPageReadApi.findScenarioAvailableStores": [
        "from("organization_scenarios_with_master") .select("available_stores") .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .limit(1) .maybeSingle()",
      ],
      "privateGroupPageReadApi.findScenarioAvailableStores (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("available_stores") .eq("scenario_master_id", "a1") .eq("organization_id", undefined) .limit(1) .maybeSingle()",
      ],
      "privateGroupPageReadApi.findScenarioForGroup": [
        "from("organization_scenarios_with_master") .select("id, organization_id, scenario_master_id, title, key_visual_url, playe…) .eq("scenario_master_id", "a1") .eq("organization_id", "a2") .single()",
      ],
      "privateGroupPageReadApi.findScenarioForGroup (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, organization_id, scenario_master_id, title, key_visual_url, playe…) .eq("scenario_master_id", "a1") .eq("organization_id", undefined) .single()",
      ],
      "privateGroupPageReadApi.getChatSettings": [
        "from("global_settings") .select("chat_enabled, chat_guest_allowed, system_msg_candidate_dates_added_ti…) .eq("organization_id", "a1") .maybeSingle()",
      ],
      "privateGroupPageReadApi.getChatSettings (最後の引数なし)": [
        "from("global_settings") .select("chat_enabled, chat_guest_allowed, system_msg_candidate_dates_added_ti…) .eq("organization_id", undefined) .maybeSingle()",
      ],
      "privateGroupPageReadApi.listActiveCouponsForGroup": [
        "from("customer_coupons") .select("id, expires_at, status, uses_remaining, coupon_campaigns (id, name, d…) .eq("customer_id", "a1") .eq("organization_id", "a3") .or("and(status.eq.active,uses_remaining.gt.0,expires_at.is.null),and(stat…)",
      ],
      "privateGroupPageReadApi.listActiveCouponsForGroup (最後の引数なし)": [
        "from("customer_coupons") .select("id, expires_at, status, uses_remaining, coupon_campaigns (id, name, d…) .eq("customer_id", "a1") .eq("organization_id", "a3") .eq("status", "active") .gt("uses_remaining", 0) .or("expires_at.is.null,expires_at.gte.a2")",
      ],
      "privateGroupPageReadApi.listActiveStoresByIdsInOrganization": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .in("id", "a1") .eq("organization_id", "a2") .eq("status", "active")",
      ],
      "privateGroupPageReadApi.listActiveStoresByIdsInOrganization (最後の引数なし)": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .in("id", "a1") .eq("organization_id", undefined) .eq("status", "active")",
      ],
      "privateGroupPageReadApi.listActiveStoresForGroup": [
        "from("stores") .select("id, name, address, region") .eq("organization_id", "a1") .eq("status", "active") .neq("is_temporary", true) .or("ownership_type.neq.office,ownership_type.is.null")",
      ],
      "privateGroupPageReadApi.listActiveStoresForGroup (最後の引数なし)": [
        "from("stores") .select("id, name, address, region") .eq("organization_id", undefined) .eq("status", "active") .neq("is_temporary", true) .or("ownership_type.neq.office,ownership_type.is.null")",
      ],
      "privateGroupPageReadApi.listActiveStoresOfOrganization": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .eq("organization_id", "a1") .eq("status", "active") .order("name")",
      ],
      "privateGroupPageReadApi.listActiveStoresOfOrganization (最後の引数なし)": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .eq("organization_id", undefined) .eq("status", "active") .order("name")",
      ],
      "privateGroupPageReadApi.listStoresByIds": [
        "from("stores") .select("id, name") .in("id", "a1")",
      ],
      "privateGroupPageReadApi.listStoresByIds (最後の引数なし)": [
        "from("stores") .select("id, name") .in("id", undefined)",
      ],
    }
  `) })
  it('貸切グループの RPC', async () => { expect(await snapshotModule(privateGroupRpc)).toMatchInlineSnapshot(`
    {
      "privateGroupRpcApi.acceptHandover": [
        "rpc("private_group_handover_accept", {"p_request_id":"a1","p_customer_id":"a2","p_contact_name":"a3","p_con…)",
      ],
      "privateGroupRpcApi.acceptHandover (最後の引数なし)": [
        "rpc("private_group_handover_accept", {"p_request_id":"a1","p_customer_id":"a2","p_contact_name":"a3","p_dis…)",
      ],
      "privateGroupRpcApi.applyCouponToMember": [
        "rpc("apply_coupon_to_group_member", "a1")",
      ],
      "privateGroupRpcApi.applyCouponToMember (最後の引数なし)": [
        "rpc("apply_coupon_to_group_member")",
      ],
      "privateGroupRpcApi.authenticateGuestByPin": [
        "rpc("authenticate_guest_by_pin_v3", "a1")",
      ],
      "privateGroupRpcApi.authenticateGuestByPin (最後の引数なし)": [
        "rpc("authenticate_guest_by_pin_v3")",
      ],
      "privateGroupRpcApi.cancelHandover": [
        "rpc("private_group_handover_cancel", {"p_request_id":"a1"})",
      ],
      "privateGroupRpcApi.cancelHandover (最後の引数なし)": [
        "rpc("private_group_handover_cancel", {})",
      ],
      "privateGroupRpcApi.cancelUnrequested": [
        "rpc("cancel_unrequested_private_group", {"p_group_id":"a1"})",
      ],
      "privateGroupRpcApi.cancelUnrequested (最後の引数なし)": [
        "rpc("cancel_unrequested_private_group", {})",
      ],
      "privateGroupRpcApi.closeUnrequestedWithNotice": [
        "rpc("cancel_unrequested_private_group_with_notice", {"p_group_id":"a1"})",
      ],
      "privateGroupRpcApi.closeUnrequestedWithNotice (最後の引数なし)": [
        "rpc("cancel_unrequested_private_group_with_notice", {})",
      ],
      "privateGroupRpcApi.confirmCharacters": [
        "rpc("private_group_confirm_characters", "a1")",
      ],
      "privateGroupRpcApi.confirmCharacters (最後の引数なし)": [
        "rpc("private_group_confirm_characters")",
      ],
      "privateGroupRpcApi.createAtomic": [
        "rpc("create_private_group_atomic", "a1")",
      ],
      "privateGroupRpcApi.createAtomic (最後の引数なし)": [
        "rpc("create_private_group_atomic")",
      ],
      "privateGroupRpcApi.createBookingRequestWithNotice": [
        "rpc("create_private_booking_request_with_notice", "a1")",
      ],
      "privateGroupRpcApi.createBookingRequestWithNotice (最後の引数なし)": [
        "rpc("create_private_booking_request_with_notice")",
      ],
      "privateGroupRpcApi.declineHandover": [
        "rpc("private_group_handover_decline", {"p_request_id":"a1"})",
      ],
      "privateGroupRpcApi.declineHandover (最後の引数なし)": [
        "rpc("private_group_handover_decline", {})",
      ],
      "privateGroupRpcApi.deleteGroup": [
        "rpc("delete_private_group", "a1")",
      ],
      "privateGroupRpcApi.deleteGroup (最後の引数なし)": [
        "rpc("delete_private_group")",
      ],
      "privateGroupRpcApi.join": [
        "rpc("join_private_group", "a1")",
      ],
      "privateGroupRpcApi.join (最後の引数なし)": [
        "rpc("join_private_group")",
      ],
      "privateGroupRpcApi.leave": [
        "rpc("private_group_leave_with_notice", {"p_group_id":"a1"})",
      ],
      "privateGroupRpcApi.leave (最後の引数なし)": [
        "rpc("private_group_leave_with_notice", {})",
      ],
      "privateGroupRpcApi.listMyHandovers": [
        "rpc("private_group_handover_mine")",
      ],
      "privateGroupRpcApi.readHandoverDetail": [
        "rpc("private_group_handover_detail", {"p_request_id":"a1"})",
      ],
      "privateGroupRpcApi.readHandoverDetail (最後の引数なし)": [
        "rpc("private_group_handover_detail", {})",
      ],
      "privateGroupRpcApi.removeCouponFromMember": [
        "rpc("remove_coupon_from_group_member", "a1")",
      ],
      "privateGroupRpcApi.removeCouponFromMember (最後の引数なし)": [
        "rpc("remove_coupon_from_group_member")",
      ],
      "privateGroupRpcApi.removeMember": [
        "rpc("private_group_remove_member", {"p_member_id":"a1"})",
      ],
      "privateGroupRpcApi.removeMember (最後の引数なし)": [
        "rpc("private_group_remove_member", {})",
      ],
      "privateGroupRpcApi.removeMemberWithNotice": [
        "rpc("private_group_remove_member_with_notice", {"p_member_id":"a1"})",
      ],
      "privateGroupRpcApi.removeMemberWithNotice (最後の引数なし)": [
        "rpc("private_group_remove_member_with_notice", {})",
      ],
      "privateGroupRpcApi.requestHandover": [
        "rpc("private_group_handover_request", {"p_group_id":"a1","p_to_member_id":"a2"})",
      ],
      "privateGroupRpcApi.requestHandover (最後の引数なし)": [
        "rpc("private_group_handover_request", {"p_group_id":"a1"})",
      ],
      "privateGroupRpcApi.setCharacterMethod": [
        "rpc("private_group_set_character_method", "a1")",
      ],
      "privateGroupRpcApi.setCharacterMethod (最後の引数なし)": [
        "rpc("private_group_set_character_method")",
      ],
      "privateGroupRpcApi.withdrawCandidate": [
        "rpc("private_group_withdraw_candidate", {"p_group_id":"a1","p_candidate_id":"a2"})",
      ],
      "privateGroupRpcApi.withdrawCandidate (最後の引数なし)": [
        "rpc("private_group_withdraw_candidate", {"p_group_id":"a1"})",
      ],
    }
  `) })
  it('予約サイトのトップ', async () => { expect(await snapshotModule(publicBooking)).toMatchInlineSnapshot(`
    {
      "publicBookingListReadApi.listAvailableScenarios": [
        "from("organization_scenarios_with_master") .select("id, slug, title, key_visual_url, author, duration, player_count_min, …) .eq("status", "available") .neq("scenario_type", "gm_test") .eq("organization_id", "a1") .order("title", {"ascending":true})",
      ],
      "publicBookingListReadApi.listAvailableScenarios (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, slug, title, key_visual_url, author, duration, player_count_min, …) .eq("status", "available") .neq("scenario_type", "gm_test") .order("title", {"ascending":true})",
      ],
      "publicBookingListReadApi.listPublicEventsInRange": [
        "from("schedule_events_public") .select("\\n            id,\\n            date,\\n            start_time,\\n      …) .gte("date", "a1") .lte("date", "a2") .eq("is_cancelled", false) .order("date", {"ascending":true}) .order("start_time", {"ascending":true}) .eq("organization_id", "a3")",
      ],
      "publicBookingListReadApi.listPublicEventsInRange (最後の引数なし)": [
        "from("schedule_events_public") .select("\\n            id,\\n            date,\\n            start_time,\\n      …) .gte("date", "a1") .lte("date", "a2") .eq("is_cancelled", false) .order("date", {"ascending":true}) .order("start_time", {"ascending":true})",
      ],
      "publicBookingListReadApi.listPublicStores": [
        "from("stores_public") .select("id, organization_id, name, short_name, address, color, capacity, room…) .eq("organization_id", "a1") .order("display_order", {"ascending":true,"nullsFirst":false})",
      ],
      "publicBookingListReadApi.listPublicStores (最後の引数なし)": [
        "from("stores_public") .select("id, organization_id, name, short_name, address, color, capacity, room…) .order("display_order", {"ascending":true,"nullsFirst":false})",
      ],
      "publicBookingReadApi.findStaffId": [
        "from("staff") .select("id") .eq("user_id", "a1") .maybeSingle()",
      ],
      "publicBookingReadApi.findStaffId (最後の引数なし)": [
        "from("staff") .select("id") .eq("user_id", undefined) .maybeSingle()",
      ],
      "publicBookingReadApi.findUserRole": [
        "from("users") .select("role") .eq("id", "a1") .maybeSingle()",
      ],
      "publicBookingReadApi.findUserRole (最後の引数なし)": [
        "from("users") .select("role") .eq("id", undefined) .maybeSingle()",
      ],
      "publicBookingReadApi.getPrivateBookingDeadlineDays": [
        "rpc("get_private_booking_deadline_days", {"p_organization_id":"a1","p_organization_slug":null})",
      ],
      "publicBookingReadApi.getPrivateBookingDeadlineDays (最後の引数なし)": [
        "rpc("get_private_booking_deadline_days", {"p_organization_slug":null})",
      ],
      "publicBookingReadApi.getScenarioLikesCount": [
        "rpc("get_scenario_likes_count")",
      ],
      "publicBookingReadApi.listPerformancePauses": [
        "from("store_recruitment_pauses") .select("store_id, pause_type, starts_on, ends_on") .in("store_id", "a1") .eq("pause_type", "performance")",
      ],
      "publicBookingReadApi.listPerformancePauses (最後の引数なし)": [
        "from("store_recruitment_pauses") .select("store_id, pause_type, starts_on, ends_on") .in("store_id", undefined) .eq("pause_type", "performance")",
      ],
      "publicBookingReadApi.listScenarioLikes": [
        "from("scenario_likes") .select("scenario_id")",
      ],
    }
  `) })
  it('売上管理', async () => { expect(await snapshotModule(salesPage)).toMatchInlineSnapshot(`
    {
      "productionCostReadApi.listScenarios": [
        "from("organization_scenarios_with_master") .select("id, title, author") .eq("organization_id", "a1") .order("title", {"ascending":true})",
      ],
      "productionCostReadApi.listScenarios (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, author") .eq("organization_id", undefined) .order("title", {"ascending":true})",
      ],
      "salesPageReadApi.listExternalSales": [
        "from("external_sales") .select("id, organization_id, type, date, scenario_id, store_name, amount, lic…) .gte("date", "a1") .lte("date", "a2") .order("date", {"ascending":false})",
      ],
      "salesPageReadApi.listExternalSales (最後の引数なし)": [
        "from("external_sales") .select("id, organization_id, type, date, scenario_id, store_name, amount, lic…) .gte("date", "a1") .lte("date", undefined) .order("date", {"ascending":false})",
      ],
      "salesPageReadApi.listMiscellaneousTransactions": [
        "from("miscellaneous_transactions") .select("id, organization_id, store_id, scenario_id, date, type, category, amo…) .gte("date", "a1") .lte("date", "a2") .order("date", {"ascending":false})",
      ],
      "salesPageReadApi.listMiscellaneousTransactions (最後の引数なし)": [
        "from("miscellaneous_transactions") .select("id, organization_id, store_id, scenario_id, date, type, category, amo…) .gte("date", "a1") .lte("date", undefined) .order("date", {"ascending":false})",
      ],
      "salesPageReadApi.listScenarioOptions": [
        "from("organization_scenarios_with_master") .select("id, title, author") .eq("organization_id", "a1") .order("title", {"ascending":true})",
      ],
      "salesPageReadApi.listScenarioOptions (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, author") .eq("organization_id", undefined) .order("title", {"ascending":true})",
      ],
      "salesPageReadApi.listScenariosWithFranchiseLicense": [
        "from("organization_scenarios_with_master") .select("id, title, franchise_license_amount, franchise_gm_test_license_amount…) .eq("organization_id", "a1") .order("title")",
      ],
      "salesPageReadApi.listScenariosWithFranchiseLicense (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title, franchise_license_amount, franchise_gm_test_license_amount…) .eq("organization_id", undefined) .order("title")",
      ],
    }
  `) })
  it('シナリオの一覧・詳細・管理', async () => { expect(await snapshotModule(scenarioPage)).toMatchInlineSnapshot(`
    {
      "scenarioCatalogReadApi.listAvailableScenarios": [
        "from("organization_scenarios_with_master") .select("id, org_scenario_id, slug, title, author, key_visual_url, duration, p…) .eq("status", "available") .neq("scenario_type", "gm_test") .order("title", {"ascending":true}) .eq("organization_id", "a1")",
      ],
      "scenarioCatalogReadApi.listAvailableScenarios (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, org_scenario_id, slug, title, author, key_visual_url, duration, p…) .eq("status", "available") .neq("scenario_type", "gm_test") .order("title", {"ascending":true})",
      ],
      "scenarioDetailEventsReadApi.startPublicEventsQuery": [
        "from("schedule_events_public") .select("a1")",
      ],
      "scenarioDetailEventsReadApi.startPublicEventsQuery (最後の引数なし)": [
        "from("schedule_events_public") .select(undefined)",
      ],
      "scenarioDetailGlobalReadApi.findCustomerIdByEmail": [
        "from("customers") .select("id") .eq("email", "a1") .maybeSingle()",
      ],
      "scenarioDetailGlobalReadApi.findCustomerIdByEmail (最後の引数なし)": [
        "from("customers") .select("id") .eq("email", undefined) .maybeSingle()",
      ],
      "scenarioDetailGlobalReadApi.findLegacyScenarioView": [
        "from("organization_scenarios_with_master") .select("id, org_scenario_id, title, slug, description, key_visual_url, durati…) .eq("scenario_master_id", "a1") .limit(1) .maybeSingle()",
      ],
      "scenarioDetailGlobalReadApi.findLegacyScenarioView (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, org_scenario_id, title, slug, description, key_visual_url, durati…) .eq("scenario_master_id", undefined) .limit(1) .maybeSingle()",
      ],
      "scenarioDetailGlobalReadApi.findMasterById": [
        "from("scenario_masters") .select("id") .eq("id", "a1") .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findMasterById (最後の引数なし)": [
        "from("scenario_masters") .select("id") .eq("id", undefined) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findMasterIdByOrgScenarioId": [
        "from("organization_scenarios") .select("scenario_master_id") .eq("id", "a1") .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findMasterIdByOrgScenarioId (最後の引数なし)": [
        "from("organization_scenarios") .select("scenario_master_id") .eq("id", undefined) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findMasterIdBySlug": [
        "from("organization_scenarios") .select("scenario_master_id") .eq("slug", "a1") .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findMasterIdBySlug (最後の引数なし)": [
        "from("organization_scenarios") .select("scenario_master_id") .eq("slug", undefined) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findOrganizationCharacters": [
        "from("organization_scenarios") .select("characters") .eq("scenario_master_id", "a1") .not("characters", "is", null) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.findOrganizationCharacters (最後の引数なし)": [
        "from("organization_scenarios") .select("characters") .eq("scenario_master_id", undefined) .not("characters", "is", null) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.getMasterDetail": [
        "from("scenario_masters") .select("id, title, author, author_id, key_visual_url, description, player_cou…) .eq("id", "a1") .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.getMasterDetail (最後の引数なし)": [
        "from("scenario_masters") .select("id, title, author, author_id, key_visual_url, description, player_cou…) .eq("id", undefined) .limit(1)",
      ],
      "scenarioDetailGlobalReadApi.listAvailableOrgScenarios": [
        "from("organization_scenarios") .select("id, organization_id, slug") .eq("scenario_master_id", "a1") .eq("org_status", "available")",
      ],
      "scenarioDetailGlobalReadApi.listAvailableOrgScenarios (最後の引数なし)": [
        "from("organization_scenarios") .select("id, organization_id, slug") .eq("scenario_master_id", undefined) .eq("org_status", "available")",
      ],
      "scenarioDetailGlobalReadApi.listAvailableOrgScenariosWithOrganization": [
        "from("organization_scenarios") .select("id, organization_id, organizations!inner (id, slug, name)") .eq("scenario_master_id", "a1") .eq("org_status", "available")",
      ],
      "scenarioDetailGlobalReadApi.listAvailableOrgScenariosWithOrganization (最後の引数なし)": [
        "from("organization_scenarios") .select("id, organization_id, organizations!inner (id, slug, name)") .eq("scenario_master_id", undefined) .eq("org_status", "available")",
      ],
      "scenarioDetailGlobalReadApi.listOrganizationIdsOfMaster": [
        "from("organization_scenarios") .select("organization_id") .eq("scenario_master_id", "a1")",
      ],
      "scenarioDetailGlobalReadApi.listOrganizationIdsOfMaster (最後の引数なし)": [
        "from("organization_scenarios") .select("organization_id") .eq("scenario_master_id", undefined)",
      ],
      "scenarioDetailGlobalReadApi.listOrganizationsByIds": [
        "from("organizations") .select("id, slug, name") .in("id", "a1")",
      ],
      "scenarioDetailGlobalReadApi.listOrganizationsByIds (最後の引数なし)": [
        "from("organizations") .select("id, slug, name") .in("id", undefined)",
      ],
      "scenarioDetailGlobalReadApi.listPublicStoresByIds": [
        "from("stores_public") .select("id, name, short_name, color, region") .in("id", "a1")",
      ],
      "scenarioDetailGlobalReadApi.listPublicStoresByIds (最後の引数なし)": [
        "from("stores_public") .select("id, name, short_name, color, region") .in("id", undefined)",
      ],
      "scenarioDetailGlobalReadApi.listUpcomingPublicEvents": [
        "from("schedule_events_public") .select("id, date, start_time, time_slot, current_participants, max_participan…) .eq("scenario_master_id", "a1") .gte("date", "a2") .in("category", ["open","offsite"]) .order("date", {"ascending":true}) .order("start_time", {"ascending":true}) .limit(50)",
      ],
      "scenarioDetailGlobalReadApi.listUpcomingPublicEvents (最後の引数なし)": [
        "from("schedule_events_public") .select("id, date, start_time, time_slot, current_participants, max_participan…) .eq("scenario_master_id", "a1") .gte("date", undefined) .in("category", ["open","offsite"]) .order("date", {"ascending":true}) .order("start_time", {"ascending":true}) .limit(50)",
      ],
      "scenarioDetailGlobalReadApi.listVisibleCharacters": [
        "from("scenario_characters") .select("id, name, description, image_url, sort_order") .eq("scenario_master_id", "a1") .eq("is_visible", true) .order("sort_order", {"ascending":true})",
      ],
      "scenarioDetailGlobalReadApi.listVisibleCharacters (最後の引数なし)": [
        "from("scenario_characters") .select("id, name, description, image_url, sort_order") .eq("scenario_master_id", undefined) .eq("is_visible", true) .order("sort_order", {"ascending":true})",
      ],
      "scenarioManagementReadApi.deleteOrganizationScenario": [
        "rpc("delete_org_scenario", {"p_scenario_id":"a1"})",
      ],
      "scenarioManagementReadApi.deleteOrganizationScenario (最後の引数なし)": [
        "rpc("delete_org_scenario", {})",
      ],
      "scenarioManagementReadApi.findOrganizationName": [
        "from("organizations") .select("name") .eq("id", "a1") .single()",
      ],
      "scenarioManagementReadApi.findOrganizationName (最後の引数なし)": [
        "from("organizations") .select("name") .eq("id", undefined) .single()",
      ],
      "scenarioManagementReadApi.listAuthors": [
        "from("organization_authors") .select("id, name, sort_order") .eq("organization_id", "a1") .order("sort_order", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listAuthors (最後の引数なし)": [
        "from("organization_authors") .select("id, name, sort_order") .eq("organization_id", undefined) .order("sort_order", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listAvailableStoresByMasterIds": [
        "from("organization_scenarios") .select("scenario_master_id, available_stores") .eq("organization_id", "a1") .in("scenario_master_id", "a2")",
      ],
      "scenarioManagementReadApi.listAvailableStoresByMasterIds (最後の引数なし)": [
        "from("organization_scenarios") .select("scenario_master_id, available_stores") .eq("organization_id", "a1") .in("scenario_master_id", undefined)",
      ],
      "scenarioManagementReadApi.listCategories": [
        "from("organization_categories") .select("id, name, sort_order") .eq("organization_id", "a1") .order("sort_order", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listCategories (最後の引数なし)": [
        "from("organization_categories") .select("id, name, sort_order") .eq("organization_id", undefined) .order("sort_order", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listGmAssignments": [
        "from("staff_scenario_assignments") .select("scenario_master_id, can_main_gm, can_sub_gm, staff:staff_id ( name )") .eq("organization_id", "a1") .in("scenario_master_id", "a2") .or("can_main_gm.eq.true,can_sub_gm.eq.true")",
      ],
      "scenarioManagementReadApi.listGmAssignments (最後の引数なし)": [
        "from("staff_scenario_assignments") .select("scenario_master_id, can_main_gm, can_sub_gm, staff:staff_id ( name )") .eq("organization_id", "a1") .in("scenario_master_id", undefined) .or("can_main_gm.eq.true,can_sub_gm.eq.true")",
      ],
      "scenarioManagementReadApi.listScenarioViews": [
        "from("organization_scenarios_with_master") .select("\\n  id,\\n  org_scenario_id,\\n  organization_id,\\n  scenario_master_id…) .eq("organization_id", "a1") .order("title", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listScenarioViews (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("\\n  id,\\n  org_scenario_id,\\n  organization_id,\\n  scenario_master_id…) .eq("organization_id", undefined) .order("title", {"ascending":true})",
      ],
      "scenarioManagementReadApi.listStoresOfOrganization": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .eq("organization_id", "a1")",
      ],
      "scenarioManagementReadApi.listStoresOfOrganization (最後の引数なし)": [
        "from("stores") .select("id, name, short_name, ownership_type, is_temporary") .eq("organization_id", undefined)",
      ],
      "scenarioMasterAdminReadApi.getMasterForEdit": [
        "from("scenario_masters") .select("id, title, author, author_id, author_email, key_visual_url, descripti…) .eq("id", "a1") .single()",
      ],
      "scenarioMasterAdminReadApi.getMasterForEdit (最後の引数なし)": [
        "from("scenario_masters") .select("id, title, author, author_id, author_email, key_visual_url, descripti…) .eq("id", undefined) .single()",
      ],
      "scenarioMasterAdminReadApi.listCharacters": [
        "from("scenario_characters") .select("id, scenario_master_id, name, description, image_url, sort_order") .eq("scenario_master_id", "a1") .order("sort_order", {"ascending":true})",
      ],
      "scenarioMasterAdminReadApi.listCharacters (最後の引数なし)": [
        "from("scenario_characters") .select("id, scenario_master_id, name, description, image_url, sort_order") .eq("scenario_master_id", undefined) .order("sort_order", {"ascending":true})",
      ],
      "scenarioMasterAdminReadApi.listMasters": [
        "from("scenario_masters") .select("id, title, author, author_id, key_visual_url, description, player_cou…) .order("updated_at", {"ascending":false})",
      ],
      "scenarioMasterAdminReadApi.listOrganizationNamesByIds": [
        "from("organizations") .select("id, name") .in("id", "a1")",
      ],
      "scenarioMasterAdminReadApi.listOrganizationNamesByIds (最後の引数なし)": [
        "from("organizations") .select("id, name") .in("id", undefined)",
      ],
      "scenarioMasterAdminReadApi.listOrganizationScenarioLinks": [
        "from("organization_scenarios") .select("scenario_master_id, organization_id")",
      ],
      "scenarioMasterAdminReadApi.listPendingCorrections": [
        "from("scenario_master_corrections") .select("\\n        *,\\n        organizations:requested_by_organization_id (nam…) .eq("scenario_master_id", "a1") .eq("status", "pending") .order("created_at", {"ascending":false})",
      ],
      "scenarioMasterAdminReadApi.listPendingCorrections (最後の引数なし)": [
        "from("scenario_master_corrections") .select("\\n        *,\\n        organizations:requested_by_organization_id (nam…) .eq("scenario_master_id", undefined) .eq("status", "pending") .order("created_at", {"ascending":false})",
      ],
      "scenarioMatcherReadApi.listEventsWithScenarioName": [
        "from("schedule_events") .select("id, date, scenario, venue") .not("scenario", "is", null) .eq("organization_id", "a1") .order("date", {"ascending":false})",
      ],
      "scenarioMatcherReadApi.listEventsWithScenarioName (最後の引数なし)": [
        "from("schedule_events") .select("id, date, scenario, venue") .not("scenario", "is", null) .order("date", {"ascending":false})",
      ],
      "scenarioMatcherReadApi.listScenarioTitles": [
        "from("organization_scenarios_with_master") .select("title") .eq("organization_id", "a1")",
      ],
      "scenarioMatcherReadApi.listScenarioTitles (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("title")",
      ],
      "scenarioMatcherReadApi.listScenarios": [
        "from("organization_scenarios_with_master") .select("id, title") .eq("organization_id", "a1") .order("title")",
      ],
      "scenarioMatcherReadApi.listScenarios (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("id, title") .order("title")",
      ],
      "scenarioPageReadApi.findEventSeats": [
        "from("schedule_events_public") .select("current_participants, max_participants, capacity") .eq("id", "a1") .single()",
      ],
      "scenarioPageReadApi.findEventSeats (最後の引数なし)": [
        "from("schedule_events_public") .select("current_participants, max_participants, capacity") .eq("id", undefined) .single()",
      ],
      "scenarioPageReadApi.listActiveBookingNotices": [
        "from("booking_notices") .select("id, content, applicable_types, store_id, store_ids, requires_pre_read…) .eq("is_active", true) .contains("applicable_types", ["a1"]) .order("sort_order", {"ascending":true})",
      ],
      "scenarioPageReadApi.listActiveBookingNotices (最後の引数なし)": [
        "from("booking_notices") .select("id, content, applicable_types, store_id, store_ids, requires_pre_read…) .eq("is_active", true) .contains("applicable_types", [null]) .order("sort_order", {"ascending":true})",
      ],
      "scenarioPageReadApi.listActiveStoresForHero": [
        "from("stores") .select("id, name, short_name") .eq("status", "active") .neq("is_temporary", true) .or("ownership_type.neq.office,ownership_type.is.null") .order("name")",
      ],
      "scenarioPageReadApi.listStoresForCatalog": [
        "from("stores") .select("id, name, short_name, ownership_type, region, address, display_order")",
      ],
    }
  `) })
  it('スケジュール管理', async () => { expect(await snapshotModule(scheduleManager)).toMatchInlineSnapshot(`
    {
      "scheduleManagerReadApi.countEventsByCategory": [
        "from("schedule_events_staff_view") .select("id", {"count":"exact","head":true}) .eq("organization_id", "a1") .gte("date", "a2") .lte("date", "a3") .eq("is_cancelled", false) .eq("category", "a4")",
      ],
      "scheduleManagerReadApi.countEventsByCategory (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id", {"count":"exact","head":true}) .eq("organization_id", "a1") .gte("date", "a2") .lte("date", "a3") .eq("is_cancelled", false) .eq("category", undefined)",
      ],
      "scheduleManagerReadApi.findEventForRecalculation": [
        "from("schedule_events_staff_view") .select("id, scenario, max_participants, capacity, current_participants, date,…) .eq("id", "a1") .single()",
      ],
      "scheduleManagerReadApi.findEventForRecalculation (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id, scenario, max_participants, capacity, current_participants, date,…) .eq("id", undefined) .single()",
      ],
      "scheduleManagerReadApi.findScenarioPricing": [
        "from("organization_scenarios_with_master") .select("duration, participation_fee, gm_test_participation_fee, participation…) .eq("organization_id", "a1") .eq("scenario_master_id", "a2") .maybeSingle()",
      ],
      "scheduleManagerReadApi.findScenarioPricing (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("duration, participation_fee, gm_test_participation_fee, participation…) .eq("organization_id", "a1") .eq("scenario_master_id", undefined) .maybeSingle()",
      ],
      "scheduleManagerReadApi.getKitTransferSettings": [
        "from("global_settings") .select("kit_transfer_offsets, kit_transfer_start_store_ids") .eq("organization_id", "a1") .single()",
      ],
      "scheduleManagerReadApi.getKitTransferSettings (最後の引数なし)": [
        "from("global_settings") .select("kit_transfer_offsets, kit_transfer_start_store_ids") .eq("organization_id", undefined) .single()",
      ],
      "scheduleManagerReadApi.listActiveReservationCounts": [
        "from("reservations") .select("participant_count, participant_names") .eq("schedule_event_id", "a1") .in("status", ["confirmed","pending"])",
      ],
      "scheduleManagerReadApi.listActiveReservationCounts (最後の引数なし)": [
        "from("reservations") .select("participant_count, participant_names") .eq("schedule_event_id", undefined) .in("status", ["confirmed","pending"])",
      ],
      "scheduleManagerReadApi.listActiveReservationsByEventIds": [
        "from("reservations") .select("schedule_event_id, participant_count, participant_names") .in("schedule_event_id", "a1") .in("status", ["confirmed","pending"])",
      ],
      "scheduleManagerReadApi.listActiveReservationsByEventIds (最後の引数なし)": [
        "from("reservations") .select("schedule_event_id, participant_count, participant_names") .in("schedule_event_id", undefined) .in("status", ["confirmed","pending"])",
      ],
      "scheduleManagerReadApi.listDemoReservationsByEventIds": [
        "from("reservations") .select("id, schedule_event_id") .eq("organization_id", "a1") .in("schedule_event_id", "a2") .in("reservation_source", ["demo","demo_auto"])",
      ],
      "scheduleManagerReadApi.listDemoReservationsByEventIds (最後の引数なし)": [
        "from("reservations") .select("id, schedule_event_id") .eq("organization_id", "a1") .in("schedule_event_id", undefined) .in("reservation_source", ["demo","demo_auto"])",
      ],
      "scheduleManagerReadApi.listDemoReservationsWithCountByEventIds": [
        "from("reservations") .select("id, schedule_event_id, participant_count") .eq("organization_id", "a1") .in("schedule_event_id", "a2") .in("reservation_source", ["demo","demo_auto"])",
      ],
      "scheduleManagerReadApi.listDemoReservationsWithCountByEventIds (最後の引数なし)": [
        "from("reservations") .select("id, schedule_event_id, participant_count") .eq("organization_id", "a1") .in("schedule_event_id", undefined) .in("reservation_source", ["demo","demo_auto"])",
      ],
      "scheduleManagerReadApi.listEventsForRecalculation": [
        "from("schedule_events_staff_view") .select("id, scenario, category, max_participants, capacity, current_participa…) .eq("organization_id", "a1") .gte("date", "a2") .lte("date", "a3") .eq("is_cancelled", false) .in("category", "a4")",
      ],
      "scheduleManagerReadApi.listEventsForRecalculation (最後の引数なし)": [
        "from("schedule_events_staff_view") .select("id, scenario, category, max_participants, capacity, current_participa…) .eq("organization_id", "a1") .gte("date", "a2") .lte("date", "a3") .eq("is_cancelled", false) .in("category", undefined)",
      ],
      "scheduleManagerReadApi.listGmtestEvents": [
        "from("schedule_events") .select("id, scenario_master_id") .eq("organization_id", "a1") .eq("category", "gmtest")",
      ],
      "scheduleManagerReadApi.listGmtestEvents (最後の引数なし)": [
        "from("schedule_events") .select("id, scenario_master_id") .eq("organization_id", undefined) .eq("category", "gmtest")",
      ],
      "scheduleManagerReadApi.listScenarioFees": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, participation_fee, gm_test_participation_fee, par…) .eq("organization_id", "a1") .in("scenario_master_id", "a2")",
      ],
      "scheduleManagerReadApi.listScenarioFees (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, participation_fee, gm_test_participation_fee, par…) .eq("organization_id", "a1") .in("scenario_master_id", undefined)",
      ],
      "scheduleManagerReadApi.listScenarioPricing": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, duration, participation_fee, gm_test_participatio…) .eq("organization_id", "a1") .in("scenario_master_id", "a2")",
      ],
      "scheduleManagerReadApi.listScenarioPricing (最後の引数なし)": [
        "from("organization_scenarios_with_master") .select("scenario_master_id, duration, participation_fee, gm_test_participatio…) .eq("organization_id", "a1") .in("scenario_master_id", undefined)",
      ],
      "scheduleManagerReadApi.listTestplayEventIds": [
        "from("schedule_events") .select("id") .eq("organization_id", "a1") .eq("category", "testplay")",
      ],
      "scheduleManagerReadApi.listTestplayEventIds (最後の引数なし)": [
        "from("schedule_events") .select("id") .eq("organization_id", undefined) .eq("category", "testplay")",
      ],
    }
  `) })
})
