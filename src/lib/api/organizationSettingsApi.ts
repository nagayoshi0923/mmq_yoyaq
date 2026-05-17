/**
 * 組織設定API
 * Discord/メール/通知設定を組織ごとに管理
 *
 * write 系（upsert / updateDiscordSettings / updateEmailSettings /
 * updateNotificationSettings / updateTimeSlotSettings / updateCustomHolidays /
 * addCustomHoliday / removeCustomHoliday）は全てバックエンド API
 * (/api/org-settings) 経由で実行する。
 *
 * - organization_id はフロントから渡さず、サーバー側で JWT から強制取得（マルチテナント境界）
 * - 機密フィールド（discord_bot_token / resend_api_key / line_channel_access_token /
 *   line_channel_secret / google_service_account_key）の更新には with_secrets=true が必須
 * - 非機密フィールドのみの更新ルートでは、誤って機密フィールドが渡された場合は
 *   サーバー側で 400 エラーになる（無音で落とさない）
 */
import { apiClient } from '@/lib/apiClient'

// 時間帯設定の型
export interface TimeSlotSetting {
  start_time: string
  end_time: string
}

export interface DayTypeTimeSlots {
  morning: TimeSlotSetting
  afternoon: TimeSlotSetting
  evening: TimeSlotSetting
}

export interface TimeSlotSettings {
  weekday: DayTypeTimeSlots  // 平日
  holiday: DayTypeTimeSlots  // 休日・祝日
}

export interface OrganizationSettings {
  id: string
  organization_id: string

  // Discord設定
  discord_bot_token?: string | null
  discord_webhook_url?: string | null
  discord_channel_id?: string | null
  discord_private_booking_channel_id?: string | null
  discord_shift_channel_id?: string | null
  discord_public_key?: string | null

  // メール設定
  resend_api_key?: string | null
  sender_email?: string | null
  sender_name?: string | null
  reply_to_email?: string | null

  // LINE設定
  line_channel_access_token?: string | null
  line_channel_secret?: string | null

  // Google設定
  google_sheets_id?: string | null
  google_service_account_key?: Record<string, unknown> | null

  // 通知設定
  notification_settings?: {
    new_reservation_email?: boolean
    new_reservation_discord?: boolean
    private_booking_email?: boolean
    private_booking_discord?: boolean
    shift_request_discord?: boolean
    reminder_email?: boolean
  }

  // 公演時間帯設定
  time_slot_settings?: TimeSlotSettings

  // カスタム休日（GW、年末年始など）
  custom_holidays?: string[]

  created_at: string
  updated_at: string
}

// upsert 用ペイロード（id / created_at / updated_at は除外）
type OrgSettingsUpsertPayload = Partial<Omit<OrganizationSettings, 'id' | 'created_at' | 'updated_at'>>

// 機密フィールドのキー（クライアント側でも宣言してルーティングに利用）
const SECRET_FIELD_KEYS = [
  'discord_bot_token',
  'resend_api_key',
  'line_channel_access_token',
  'line_channel_secret',
  'google_service_account_key',
] as const

function hasSecretField(payload: Record<string, unknown>): boolean {
  return Object.keys(payload).some((k) =>
    (SECRET_FIELD_KEYS as readonly string[]).includes(k),
  )
}

export const organizationSettingsApi = {
  // 現在の組織の設定を取得
  // バックエンド API (/api/org-settings) 経由で org_id をサーバー側で強制フィルタする
  async get(): Promise<OrganizationSettings | null> {
    return apiClient.get<OrganizationSettings | null>('/api/org-settings')
  },

  // 機密トークン含む全設定を取得（設定編集画面専用）
  // バックエンド API (/api/org-settings?with_secrets=true) 経由
  async getWithSecrets(): Promise<OrganizationSettings | null> {
    return apiClient.get<OrganizationSettings | null>('/api/org-settings?with_secrets=true')
  },

  // 設定を作成または更新（upsert）
  // バックエンド API (/api/org-settings) PATCH 経由。organization_id は JWT 由来で強制。
  // クライアントが payload に organization_id を渡しても無視される。
  // 機密フィールドが含まれる場合は自動的に with_secrets=true を付与する。
  async upsert(
    settings: OrgSettingsUpsertPayload,
  ): Promise<OrganizationSettings> {
    // organization_id をクライアントから渡しても無視される（サーバー側で JWT から強制）
    // 念のためここで剥がしておく
    const { organization_id: _ignored, ...rest } = settings as OrgSettingsUpsertPayload & {
      organization_id?: string
    }
    void _ignored

    const updates = rest as Record<string, unknown>
    const path = hasSecretField(updates)
      ? '/api/org-settings?with_secrets=true'
      : '/api/org-settings'
    return apiClient.patch<OrganizationSettings>(path, { updates })
  },

  // Discord設定のみ更新
  // discord_bot_token が含まれる場合は機密フィールドのため、サーバー側で
  // with_secrets=true が要求される（upsert 内で自動判定）。
  async updateDiscordSettings(settings: {
    discord_bot_token?: string
    discord_webhook_url?: string
    discord_channel_id?: string
    discord_private_booking_channel_id?: string
    discord_shift_channel_id?: string
    discord_public_key?: string
  }): Promise<OrganizationSettings> {
    return this.upsert(settings)
  },

  // メール設定のみ更新
  // resend_api_key が含まれる場合は機密フィールド扱い。
  async updateEmailSettings(settings: {
    resend_api_key?: string
    sender_email?: string
    sender_name?: string
    reply_to_email?: string
  }): Promise<OrganizationSettings> {
    return this.upsert(settings)
  },

  // 通知設定のみ更新（非機密）
  async updateNotificationSettings(settings: OrganizationSettings['notification_settings']): Promise<OrganizationSettings> {
    return this.upsert({ notification_settings: settings })
  },

  // 公演時間帯設定のみ更新（非機密）
  async updateTimeSlotSettings(settings: TimeSlotSettings): Promise<OrganizationSettings> {
    return this.upsert({ time_slot_settings: settings })
  },

  // 公演時間帯設定を取得（デフォルト値付き）
  async getTimeSlotSettings(): Promise<TimeSlotSettings> {
    const settings = await this.get()
    const defaultSettings: TimeSlotSettings = {
      weekday: {
        morning: { start_time: '10:00', end_time: '14:00' },
        afternoon: { start_time: '14:30', end_time: '18:30' },
        evening: { start_time: '19:00', end_time: '23:00' }
      },
      holiday: {
        morning: { start_time: '10:00', end_time: '14:00' },
        afternoon: { start_time: '14:30', end_time: '18:30' },
        evening: { start_time: '19:00', end_time: '23:00' }
      }
    }
    return settings?.time_slot_settings || defaultSettings
  },

  // カスタム休日を取得
  async getCustomHolidays(): Promise<string[]> {
    const settings = await this.get()
    return settings?.custom_holidays || []
  },

  // カスタム休日を更新（非機密）
  async updateCustomHolidays(holidays: string[]): Promise<OrganizationSettings> {
    // 日付をソートして重複を除去
    const uniqueHolidays = [...new Set(holidays)].sort()
    return this.upsert({ custom_holidays: uniqueHolidays })
  },

  // 特定の日付を休日として追加
  async addCustomHoliday(date: string): Promise<OrganizationSettings> {
    const current = await this.getCustomHolidays()
    if (current.includes(date)) return this.get() as Promise<OrganizationSettings>
    return this.updateCustomHolidays([...current, date])
  },

  // 特定の日付を休日から削除
  async removeCustomHoliday(date: string): Promise<OrganizationSettings> {
    const current = await this.getCustomHolidays()
    return this.updateCustomHolidays(current.filter(d => d !== date))
  },

  // 日付がカスタム休日かどうか判定
  async isCustomHoliday(date: string): Promise<boolean> {
    const holidays = await this.getCustomHolidays()
    return holidays.includes(date)
  }
}
