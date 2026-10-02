/**
 * 画面・部品の読み取りAPI（Phase 2、#773）が発行するクエリを固定する。
 * 固定するのは「どのテーブルに、どの列を、どの絞り込みで問い合わせるか」。元の画面の呼び出しと同じであることの確認用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderCalls, type RecordedCall } from './testing/chainRecorder'

const rec = vi.hoisted(() => ({ calls: [] as Array<[string, unknown[]]> }))
vi.mock('@/lib/supabase', async () => {
  const { makeSupabaseRecorder } = await import('./testing/chainRecorder')
  return { supabase: makeSupabaseRecorder(rec.calls as RecordedCall[]) }
})
import { scenarioMasterReadApi, scenarioCharacterReadApi, organizationScenarioReadApi } from './scenarioReadApi'
import { organizationReadApi, storeUsageReadApi, loginProfileReadApi, globalSettingsReadApi } from './organizationReadApi'
import { customerReadApi } from './customerReadApi'
import { reservationReadApi } from './reservationReadApi'
import { scheduleUiApi } from './scheduleUiApi'

beforeEach(() => { rec.calls.length = 0 })
const shorten = (calls: Array<[string, unknown[]]>) => renderCalls(calls as RecordedCall[])

describe('シナリオ', () => {
  it('マスタ・キャラクター・組織のシナリオ', async () => {
    await scenarioMasterReadApi.listForAdd()
    await scenarioMasterReadApi.listForPicker()
    await scenarioMasterReadApi.getForEdit('m1')
    await scenarioCharacterReadApi.listByMaster('m1')
    await organizationScenarioReadApi.listByMasterWithOrganization('m1')
    await organizationScenarioReadApi.getEmailTemplates('s1')
    await organizationScenarioReadApi.findIdByMaster('m1', 'o1')
    await organizationScenarioReadApi.getSurveyViewByMaster('m1', 'o1')
    await organizationScenarioReadApi.getSurveyViewByOrgScenarioId('s1', 'o1')
    expect(shorten(rec.calls)).toMatchInlineSnapshot(`
      [
        "from("scenario_masters") .select("id, title, author, author_id, key_visual_url, description, player_cou…) .in("master_status", ["pending","approved"]) .order("title", {"ascending":true})",
        "from("scenario_masters") .select("id, title, author, author_id, key_visual_url, gallery_images, descrip…) .in("master_status", ["approved","pending"]) .order("title")",
        "from("scenario_masters") .select("id, title, author, author_id, author_email, key_visual_url, gallery_i…) .eq("id", "m1") .single()",
        "from("scenario_characters") .select("id, scenario_master_id, name, description, image_url, sort_order") .eq("scenario_master_id", "m1") .order("sort_order", {"ascending":true})",
        "from("organization_scenarios") .select("\\n          id,\\n          organization_id,\\n          org_status,\\n …) .eq("scenario_master_id", "m1")",
        "from("organization_scenarios") .select("individual_notice_template, reservation_confirmation_template, privat…) .eq("id", "s1") .maybeSingle()",
        "from("organization_scenarios") .select("id") .eq("scenario_master_id", "m1") .eq("organization_id", "o1") .maybeSingle()",
        "from("organization_scenarios_with_master") .select("org_scenario_id, survey_enabled, characters, player_count_max, indivi…) .eq("scenario_master_id", "m1") .eq("organization_id", "o1") .maybeSingle()",
        "from("organization_scenarios_with_master") .select("org_scenario_id, survey_enabled, characters, player_count_max, indivi…) .eq("org_scenario_id", "s1") .eq("organization_id", "o1") .maybeSingle()",
      ]
    `)
  })
})

describe('組織・店舗・ログイン・全体設定', () => {
  it('発行するクエリ', async () => {
    await organizationReadApi.getSlugById('o1')
    await organizationReadApi.findSlugById('o1')
    await storeUsageReadApi.countEvents('st1')
    await storeUsageReadApi.countReservations('st1')
    await storeUsageReadApi.countKits('st1')
    await storeUsageReadApi.findOrganizationId('st1')
    await loginProfileReadApi.checkEmailRegistrationStatus('a@example.com')
    await loginProfileReadApi.findUserProfile('u1')
    await loginProfileReadApi.findStaffWithOrganizationSlug('u1')
    await loginProfileReadApi.findStaffOnly('u1')
    await globalSettingsReadApi.getIndividualNoticeDefaultBody('o1')
    expect(shorten(rec.calls)).toMatchInlineSnapshot(`
      [
        "from("organizations") .select("slug") .eq("id", "o1") .single()",
        "from("organizations") .select("slug") .eq("id", "o1") .maybeSingle()",
        "from("schedule_events_staff_view") .select("id", {"count":"exact","head":true}) .eq("store_id", "st1")",
        "from("reservations") .select("id", {"count":"exact","head":true}) .eq("store_id", "st1")",
        "from("performance_kits") .select("id", {"count":"exact","head":true}) .eq("store_id", "st1")",
        "from("stores") .select("organization_id") .eq("id", "st1") .maybeSingle()",
        "rpc("check_email_registration_status", {"p_email":"a@example.com"})",
        "from("users") .select("role, organization_id, is_store_representative") .eq("id", "u1") .maybeSingle()",
        "from("staff") .select("organization_id, role, organizations(slug)") .eq("user_id", "u1") .maybeSingle()",
        "from("staff") .select("organization_id, role") .eq("user_id", "u1") .maybeSingle()",
        "from("global_settings") .select("individual_notice_default_body") .eq("organization_id", "o1") .maybeSingle()",
      ]
    `)
  })
})

describe('顧客・予約', () => {
  it('顧客の検索と、組織の有無で変わる絞り込み', async () => {
    await customerReadApi.searchForPalette('o1', '%山%')
    await customerReadApi.findDemoCustomer('o1')
    const withOrg = shorten(rec.calls.splice(0))
    await customerReadApi.findDemoCustomer(undefined)
    const withoutOrg = shorten(rec.calls.splice(0))
    await customerReadApi.findByNameForParticipation('山田', 'o1')
    const nameWithOrg = shorten(rec.calls.splice(0))
    await customerReadApi.findByNameForParticipation('山田')
    const nameWithoutOrg = shorten(rec.calls.splice(0))
    await customerReadApi.listNames()
    expect({ withOrg, withoutOrg, nameWithOrg, nameWithoutOrg, names: shorten(rec.calls) }).toMatchInlineSnapshot(`
      {
        "nameWithOrg": [
          "from("customers") .select("id, name, email, phone") .eq("name", "山田") .or("organization_id.eq.o1,organization_id.is.null") .limit(1) .maybeSingle()",
        ],
        "nameWithoutOrg": [
          "from("customers") .select("id, name, email, phone") .eq("name", "山田") .limit(1) .maybeSingle()",
        ],
        "names": [
          "from("customers") .select("name") .not("name", "is", null) .not("name", "eq", "")",
        ],
        "withOrg": [
          "from("customers") .select("id, name, email, phone") .eq("organization_id", "o1") .or("name.ilike.%山%,email.ilike.%山%,phone.ilike.%山%") .limit(5)",
          "from("customers") .select("id") .or("name.ilike.%デモ%,email.ilike.%demo%") .eq("organization_id", "o1") .limit(1) .single()",
        ],
        "withoutOrg": [
          "from("customers") .select("id") .or("name.ilike.%デモ%,email.ilike.%demo%") .limit(1) .single()",
        ],
      }
    `)
  })
  it('予約の検索・顧客つき取得・メモの候補', async () => {
    await reservationReadApi.searchForPalette('o1', '%A%')
    await reservationReadApi.listActiveWithCustomerById('r1')
    const a = shorten(rec.calls.splice(0))
    await reservationReadApi.listCustomerNotes('o1')
    const withOrg = shorten(rec.calls.splice(0))
    await reservationReadApi.listCustomerNotes(null)
    expect({ a, withOrg, withoutOrg: shorten(rec.calls) }).toMatchInlineSnapshot(`
      {
        "a": [
          "from("reservations") .select("id, reservation_number, customer_name, title, status, actual_datetime…) .eq("organization_id", "o1") .or("customer_name.ilike.%A%,reservation_number.ilike.%A%,title.ilike.%A%") .order("actual_datetime", {"ascending":false}) .limit(5)",
          "from("reservations") .select("id, organization_id, reservation_number, reservation_page_id, title, …) .eq("id", "r1") .in("status", ["pending","confirmed","gm_confirmed","checked_in","cancelled"])",
        ],
        "withOrg": [
          "from("reservations") .select("customer_notes, participant_names") .not("customer_notes", "is", null) .not("customer_notes", "eq", "") .eq("organization_id", "o1")",
        ],
        "withoutOrg": [
          "from("reservations") .select("customer_notes, participant_names") .not("customer_notes", "is", null) .not("customer_notes", "eq", "")",
        ],
      }
    `)
  })
})

describe('公演の画面', () => {
  it('発行するクエリ（組織の有無で変わるものは両方）', async () => {
    await scheduleUiApi.getPerformanceBookingWindow('e1')
    await scheduleUiApi.listEventIdsInRange('2026-10-01', '2026-10-31', 'o1')
    const evWithOrg = shorten(rec.calls.splice(0))
    await scheduleUiApi.listEventIdsInRange('2026-10-01', '2026-10-31', null)
    const evWithoutOrg = shorten(rec.calls.splice(0))
    await scheduleUiApi.adminDeleteReservationsByScheduleEventIds({ p_schedule_event_ids: ['e1'] })
    await scheduleUiApi.getDailyMemoText('2026-10-01', 'st1')
    await scheduleUiApi.listStaffViewEventsInRange('2026-10-01', '2026-10-31')
    await scheduleUiApi.getBusinessHours('st1', 'o1')
    const bhWithOrg = shorten(rec.calls.splice(0))
    await scheduleUiApi.getBusinessHours('st1')
    const bhWithoutOrg = shorten(rec.calls.splice(0))
    await scheduleUiApi.findLatestEventAt('o1', '2026-10-01', '14:00')
    await scheduleUiApi.getEventGms('e1')
    await scheduleUiApi.listSlotMemosInRange('2026-10-01', '2026-10-31')
    await scheduleUiApi.getSlotMemo('2026-10-01', 'st1', 'afternoon')
    await scheduleUiApi.sendPrivateGroupIndividualNotice({ groupId: 'g1', memberId: 'm1', message: 'hi', characterId: null, attachTemplate: true })
    const rest = shorten(rec.calls.splice(0))
    await scheduleUiApi.findEmailSettings({ storeId: 'st1' })
    const emailStore = shorten(rec.calls.splice(0))
    await scheduleUiApi.findEmailSettings({ organizationId: 'o1' })
    expect({ evWithOrg, evWithoutOrg, bhWithOrg, bhWithoutOrg, rest, emailStore, emailOrg: shorten(rec.calls) }).toMatchInlineSnapshot(`
      {
        "bhWithOrg": [
          "rpc("admin_delete_reservations_by_schedule_event_ids", {"p_schedule_event_ids":["e1"]})",
          "from("daily_memos") .select("memo_text") .eq("date", "2026-10-01") .eq("venue_id", "st1") .maybeSingle()",
          "from("schedule_events_staff_view") .select("id, date, store_id, start_time, is_cancelled, scenario, notes, gms, r…) .gte("date", "2026-10-01") .lte("date", "2026-10-31")",
          "from("business_hours_settings") .select("opening_hours, holidays, time_restrictions") .eq("store_id", "st1") .eq("organization_id", "o1") .maybeSingle()",
        ],
        "bhWithoutOrg": [
          "from("business_hours_settings") .select("opening_hours, holidays, time_restrictions") .eq("store_id", "st1") .maybeSingle()",
        ],
        "emailOrg": [
          "from("email_settings") .select("reservation_confirmation_template, private_confirm_template, company_…) .eq("organization_id", "o1") .limit(1) .maybeSingle()",
        ],
        "emailStore": [
          "from("email_settings") .select("reservation_confirmation_template, private_confirm_template, company_…) .eq("store_id", "st1") .limit(1) .maybeSingle()",
        ],
        "evWithOrg": [
          "rpc("get_performance_booking_window", {"p_event_id":"e1"})",
          "from("schedule_events") .select("id") .gte("date", "2026-10-01") .lte("date", "2026-10-31") .eq("organization_id", "o1")",
        ],
        "evWithoutOrg": [
          "from("schedule_events") .select("id") .gte("date", "2026-10-01") .lte("date", "2026-10-31")",
        ],
        "rest": [
          "from("schedule_events") .select("id") .eq("organization_id", "o1") .eq("date", "2026-10-01") .eq("start_time", "14:00") .order("created_at", {"ascending":false}) .limit(1) .maybeSingle()",
          "from("schedule_events_staff_view") .select("gms, gm_roles") .eq("id", "e1") .single()",
          "from("schedule_slot_memos") .select("date, store_id, time_slot, memo") .gte("date", "2026-10-01") .lte("date", "2026-10-31")",
          "from("schedule_slot_memos") .select("memo") .eq("date", "2026-10-01") .eq("store_id", "st1") .eq("time_slot", "afternoon") .maybeSingle()",
          "rpc("private_group_send_individual_notice", {"p_group_id":"g1","p_member_id":"m1","p_message":"hi","p_character_id…)",
        ],
      }
    `)
  })
})
