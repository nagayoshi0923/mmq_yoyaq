/**
 * 設定画面（ブログ・予約の注意事項・作者/カテゴリ・データ出力・通知・組織情報・給与・シフト・システム）の読み取りAPI
 *
 * 画面・フックから supabase を直接呼ばず、ここを通す（整備 Phase 2、#773）。
 * 絞り込み条件・select の列・戻り値（{ data, error }）は元の呼び出しのまま。
 */
import { supabase } from '@/lib/supabase'
import { BLOG_POST_SELECT_COLUMNS } from '@/lib/blogPublicFetch'
import type { OrgMasterTable } from '@/lib/api/scenarioWriteApi'

export const settingsPageReadApi = {
  /** 組織のブログ記事を新しい順に */
  async listBlogPosts(organizationId: string) {
    return supabase
      .from('blog_posts')
      .select(BLOG_POST_SELECT_COLUMNS)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
  },

  /** 予約の注意事項を並び順に */
  async listBookingNotices() {
    return supabase
      .from('booking_notices')
      .select('id, organization_id, content, applicable_types, store_id, store_ids, requires_pre_reading, is_active, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
  },

  /** 作者・カテゴリの一覧（並び順） */
  async listOrgMasterItems(tableName: OrgMasterTable, organizationId: string) {
    return supabase
      .from(tableName)
      .select('id, organization_id, name, sort_order, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
  },

  /** 組織のシナリオの、ジャンルか作者の列（使用数の集計用） */
  async listScenarioColumn(scenarioColumn: 'genre' | 'author', organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select(scenarioColumn)
      .eq('organization_id', organizationId)
  },

  /** ジャンルを含む組織のシナリオ（名前変更・削除の反映用） */
  async listScenariosWithGenre(organizationId: string, genre: string) {
    return supabase
      .from('organization_scenarios')
      .select('id, override_genre')
      .eq('organization_id', organizationId)
      .contains('override_genre', [genre])
  },


  /** 店舗のデータ出力設定 */
  async getDataManagementSettings(storeId: string) {
    return supabase
      .from('data_management_settings')
      .select('id, store_id, export_format')
      .eq('store_id', storeId).maybeSingle()
  },

  /** データ出力: 期間内の予約 */
  async listReservationsForExport(organizationId: string, dateFrom: string, dateTo: string) {
    return supabase
      .from('reservations')
      .select('reservation_number, status, actual_datetime, duration, participant_count, final_price, payment_status, payment_method, customer_id, store_id, scenarios(title), stores(short_name, name), customers(name, email, phone_number)')
      .eq('organization_id', organizationId)
      .gte('actual_datetime', dateFrom + 'T00:00:00')
      .lte('actual_datetime', dateTo + 'T23:59:59')
      .order('actual_datetime', { ascending: false })
  },

  /** データ出力: スタッフ一覧 */
  async listStaffForExport(organizationId: string) {
    return supabase
      .from('staff')
      .select('name, line_name, email, phone, status, role, created_at, stores(short_name)')
      .eq('organization_id', organizationId)
      .order('name')
  },

  /** データ出力: シナリオ一覧 */
  async listScenariosForExport(organizationId: string) {
    return supabase
      .from('organization_scenarios_with_master')
      .select('title, author, report_display_name, genre, difficulty, duration, weekend_duration, player_count_min, player_count_max, participation_fee, status, org_status, play_count, has_pre_reading, release_date, notes, created_at')
      .eq('organization_id', organizationId)
      .order('title')
  },

  /** 店舗別の通知設定 */
  async getStoreNotificationSettings(storeId: string) {
    return supabase
      .from('notification_settings')
      .select('id, store_id, organization_id, new_reservation_email, new_reservation_discord, cancellation_email, cancellation_discord, shift_reminder_days, performance_reminder_days, sales_report_notification, discord_webhook_url, updated_at')
      .eq('store_id', storeId)
      .maybeSingle()
  },

  /** 組織の通知設定（全体設定の通知列） */
  async getGlobalNotificationSettings(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('id, enable_email_notifications, enable_discord_notifications, pre_reading_notice_message, system_msg_group_created_title, system_msg_group_created_body, system_msg_group_created_note, system_msg_booking_requested_title, system_msg_booking_requested_body, system_msg_schedule_confirmed_title, system_msg_schedule_confirmed_body, system_msg_booking_rejected_title, system_msg_booking_rejected_body, system_msg_booking_cancelled_title, system_msg_booking_cancelled_body')
      .eq('organization_id', organizationId)
      .single()
  },

  /** 組織の管理者ユーザー（admin / license_admin） */
  async listOrganizationAdmins(organizationId: string) {
    return supabase
      .from('users')
      .select('id, email, display_name, role, created_at')
      .eq('organization_id', organizationId)
      .in('role', ['admin', 'license_admin'])
      .order('created_at')
  },

  /** ユーザー ID から、スタッフの名前 */
  async listStaffNamesByUserIds(userIds: string[]) {
    return supabase
      .from('staff')
      .select('user_id, name')
      .in('user_id', userIds)
  },

  /** 給与設定（全体設定の給与列） */
  async getSalarySettings(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('id, organization_id, gm_base_pay, gm_hourly_rate, gm_test_base_pay, gm_test_hourly_rate, reception_fixed_pay, use_hourly_table, hourly_rates, gm_test_hourly_rates, updated_at')
      .eq('organization_id', organizationId)
      .single()
  },

  /** シフト設定（全体設定のシフト列） */
  async getShiftSettings(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('id, shift_submission_start_day, shift_submission_end_day, shift_submission_target_months_ahead, shift_edit_deadline_days_before')
      .eq('organization_id', organizationId)
      .single()
  },

  /** システム名（全体設定） */
  async getSystemName(organizationId: string) {
    return supabase
      .from('global_settings')
      .select('id, system_name')
      .eq('organization_id', organizationId)
      .single()
  },
}

export interface EmailLogListParams {
  page: number
  pageSize: number
  status: string
  type: string
  dateFrom: string
  dateTo: string
  /** PostgREST 用にエスケープ済みのキーワード。空なら検索しない */
  escapedKeyword: string
}

export const emailLogReadApi = {
  /** メールログの一覧（絞り込み・ページング・件数つき） */
  async listPage(params: EmailLogListParams) {
    let query = supabase
      .from('email_logs')
      .select(
        'id, organization_id, reservation_id, schedule_event_id, email_type, to_email, to_name, subject, body_text, body_html, provider, provider_message_id, status, error_message, sent_at, delivered_at, opened_at, bounced_at, complained_at, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(params.page * params.pageSize, (params.page + 1) * params.pageSize - 1)

    if (params.status !== 'all') {
      query = query.eq('status', params.status)
    }
    if (params.type !== 'all') {
      query = query.eq('email_type', params.type)
    }
    if (params.dateFrom) {
      query = query.gte('created_at', `${params.dateFrom}T00:00:00+09:00`)
    }
    if (params.dateTo) {
      query = query.lte('created_at', `${params.dateTo}T23:59:59+09:00`)
    }
    if (params.escapedKeyword) {
      query = query.or(
        `to_email.ilike.%${params.escapedKeyword}%,to_name.ilike.%${params.escapedKeyword}%,subject.ilike.%${params.escapedKeyword}%,provider_message_id.ilike.%${params.escapedKeyword}%`,
      )
    }

    return query
  },
}

export const notificationSettingsListReadApi = {
  /** 稼働中のスタッフ（Discord チャンネルつき）を名前順。組織が分かれば絞る */
  async listActiveStaff(organizationId: string | null | undefined) {
    let query = supabase
      .from('staff')
      .select('id, name, discord_channel_id')
      .eq('status', 'active')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query.order('name')
  },
  /** 組織のシナリオ（id と題名）を題名順。組織が分かれば絞る */
  async listScenarioTitles(organizationId: string | null | undefined) {
    let query = supabase
      .from('organization_scenarios_with_master')
      .select('id, title')
      .order('title')

    if (organizationId) {
      query = query.eq('organization_id', organizationId)
    }

    return query
  },
}

