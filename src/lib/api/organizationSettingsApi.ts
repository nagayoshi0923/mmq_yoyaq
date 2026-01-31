/**
 * 組織設定API
 * Discord/メール/通知設定を組織ごとに管理
 */
import { supabase } from '../supabase'
import { getCurrentOrganizationId } from '@/lib/organization'

// NOTE: Supabase の型推論（select parser）の都合で、select 文字列は literal に寄せる
const ORG_SETTINGS_SELECT_FIELDS =
  'id, organization_id, discord_bot_token, discord_webhook_url, discord_channel_id, discord_private_booking_channel_id, discord_shift_channel_id, discord_public_key, resend_api_key, sender_email, sender_name, reply_to_email, line_channel_access_token, line_channel_secret, google_sheets_id, google_service_account_key, notification_settings, time_slot_settings, created_at, updated_at' as const

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
  
  created_at: string
  updated_at: string
}

export const organizationSettingsApi = {
  // 現在の組織の設定を取得
  async get(): Promise<OrganizationSettings | null> {
    const organizationId = await getCurrentOrganizationId()
    if (!organizationId) return null
    
    const { data, error } = await supabase
      .from('organization_settings')
      .select(ORG_SETTINGS_SELECT_FIELDS)
      .eq('organization_id', organizationId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  },
  
  // 組織IDで設定を取得
  async getByOrganizationId(organizationId: string): Promise<OrganizationSettings | null> {
    const { data, error } = await supabase
      .from('organization_settings')
      .select(ORG_SETTINGS_SELECT_FIELDS)
      .eq('organization_id', organizationId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  },
  
  // 設定を作成または更新
  async upsert(settings: Partial<Omit<OrganizationSettings, 'id' | 'created_at' | 'updated_at'>>): Promise<OrganizationSettings> {
    const organizationId = settings.organization_id || await getCurrentOrganizationId()
    if (!organizationId) {
      throw new Error('組織情報が取得できません。再ログインしてください。')
    }
    
    const { data, error } = await supabase
      .from('organization_settings')
      .upsert({
        ...settings,
        organization_id: organizationId
      }, {
        onConflict: 'organization_id'
      })
      .select()
      .single()
    
    if (error) throw error
    return data
  },
  
  // Discord設定のみ更新
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
  async updateEmailSettings(settings: {
    resend_api_key?: string
    sender_email?: string
    sender_name?: string
    reply_to_email?: string
  }): Promise<OrganizationSettings> {
    return this.upsert(settings)
  },
  
  // 通知設定のみ更新
  async updateNotificationSettings(settings: OrganizationSettings['notification_settings']): Promise<OrganizationSettings> {
    return this.upsert({ notification_settings: settings })
  },
  
  // 公演時間帯設定のみ更新
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
  }
}


