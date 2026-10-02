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
      "myPageDataReadApi.getUserDisplayNames": [
        "rpc("get_user_display_names", {"user_ids":"a1"})",
      ],
      "myPageDataReadApi.getUserDisplayNames (最後の引数なし)": [
        "rpc("get_user_display_names", {})",
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
        "from("schedule_events_public") .select("id, date, start_time, category, current_participants, max_participant…) .in("id", "a1")",
      ],
      "myPageDataReadApi.listPublicEventsByIds (最後の引数なし)": [
        "from("schedule_events_public") .select("id, date, start_time, category, current_participants, max_participant…) .in("id", undefined)",
      ],
      "myPageDataReadApi.listRatings": [
        "from("scenario_ratings") .select("scenario_master_id, rating") .eq("customer_id", "a1")",
      ],
      "myPageDataReadApi.listRatings (最後の引数なし)": [
        "from("scenario_ratings") .select("scenario_master_id, rating") .eq("customer_id", undefined)",
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
        "from("schedule_events_public") .select("date, start_time, category, current_participants, max_participants, s…) .eq("id", "a1") .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEvent (最後の引数なし)": [
        "from("schedule_events_public") .select("date, start_time, category, current_participants, max_participants, s…) .eq("id", undefined) .maybeSingle()",
      ],
      "myPageReservationReadApi.findPublicEventForNotice": [
        "from("schedule_events_public") .select("date, start_time, end_time, scenario, venue, organization_id") .eq("id", "a1") .single()",
      ],
      "myPageReservationReadApi.findPublicEventForNotice (最後の引数なし)": [
        "from("schedule_events_public") .select("date, start_time, end_time, scenario, venue, organization_id") .eq("id", undefined) .single()",
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
      "myPageReservationReadApi.listConfirmedParticipantCounts": [
        "from("reservations") .select("participant_count") .eq("schedule_event_id", "a1") .eq("status", "confirmed")",
      ],
      "myPageReservationReadApi.listConfirmedParticipantCounts (最後の引数なし)": [
        "from("reservations") .select("participant_count") .eq("schedule_event_id", undefined) .eq("status", "confirmed")",
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
