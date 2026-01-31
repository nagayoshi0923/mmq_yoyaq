/**
 * Edge Functions共通: 組織設定取得ヘルパー
 * 
 * 使用方法:
 * import { getOrganizationSettings, getDiscordSettings, getEmailSettings } from '../_shared/organization-settings.ts'
 * 
 * const settings = await getOrganizationSettings(supabaseClient, organizationId)
 */

// @ts-nocheck
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface EmailTemplates {
  greeting?: string
  signature?: string
  footer?: string
  booking_confirmation?: { subject_prefix?: string; additional_notes?: string }
  cancellation_confirmation?: { subject_prefix?: string; additional_notes?: string }
  waitlist_notification?: { subject_prefix?: string; additional_notes?: string }
  reminder?: { subject_prefix?: string; additional_notes?: string }
}

export interface OrganizationSettings {
  id: string
  organization_id: string
  
  // Discord設定
  discord_bot_token: string | null
  discord_webhook_url: string | null
  discord_channel_id: string | null
  discord_private_booking_channel_id: string | null
  discord_shift_channel_id: string | null
  discord_public_key: string | null
  
  // メール設定
  resend_api_key: string | null
  sender_email: string | null
  sender_name: string | null
  reply_to_email: string | null
  
  // メールテンプレート
  email_templates: EmailTemplates | null
  
  // 通知設定
  notification_settings: {
    new_reservation_email?: boolean
    new_reservation_discord?: boolean
    private_booking_email?: boolean
    private_booking_discord?: boolean
    shift_request_discord?: boolean
    reminder_email?: boolean
  } | null
}

/**
 * 組織設定を取得
 * @param supabase Supabaseクライアント（service_role推奨）
 * @param organizationId 組織ID
 */
export async function getOrganizationSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrganizationSettings | null> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select([
      'id',
      'organization_id',
      'discord_bot_token',
      'discord_webhook_url',
      'discord_channel_id',
      'discord_private_booking_channel_id',
      'discord_shift_channel_id',
      'discord_public_key',
      'resend_api_key',
      'sender_email',
      'sender_name',
      'reply_to_email',
      'email_templates',
      'notification_settings',
    ].join(','))
    .eq('organization_id', organizationId)
    .single()
  
  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    console.error('組織設定取得エラー:', error)
    return null
  }
  
  return data
}

/**
 * Discord設定を取得（フォールバック: 環境変数）
 */
export async function getDiscordSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  botToken: string | null
  webhookUrl: string | null
  channelId: string | null
  privateBookingChannelId: string | null
  shiftChannelId: string | null
  publicKey: string | null
}> {
  const settings = await getOrganizationSettings(supabase, organizationId)
  
  return {
    botToken: settings?.discord_bot_token || Deno.env.get('DISCORD_BOT_TOKEN') || null,
    webhookUrl: settings?.discord_webhook_url || Deno.env.get('DISCORD_WEBHOOK_URL') || null,
    channelId: settings?.discord_channel_id || Deno.env.get('DISCORD_CHANNEL_ID') || null,
    privateBookingChannelId: settings?.discord_private_booking_channel_id || Deno.env.get('DISCORD_PRIVATE_BOOKING_CHANNEL_ID') || null,
    shiftChannelId: settings?.discord_shift_channel_id || Deno.env.get('DISCORD_SHIFT_CHANNEL_ID') || null,
    publicKey: settings?.discord_public_key || Deno.env.get('DISCORD_PUBLIC_KEY') || null,
  }
}

/**
 * メール設定を取得（フォールバック: 環境変数）
 */
export async function getEmailSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  resendApiKey: string | null
  senderEmail: string
  senderName: string
  replyToEmail: string | null
}> {
  const settings = await getOrganizationSettings(supabase, organizationId)
  
  return {
    resendApiKey: settings?.resend_api_key || Deno.env.get('RESEND_API_KEY') || null,
    senderEmail: settings?.sender_email || Deno.env.get('SENDER_EMAIL') || 'noreply@example.com',
    senderName: settings?.sender_name || Deno.env.get('SENDER_NAME') || 'MMQ予約システム',
    replyToEmail: settings?.reply_to_email || Deno.env.get('REPLY_TO_EMAIL') || null,
  }
}

/**
 * メールテンプレートを取得（デフォルト値付き）
 */
export async function getEmailTemplates(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  greeting: string
  signature: string
  footer: string
  templates: EmailTemplates
}> {
  const settings = await getOrganizationSettings(supabase, organizationId)
  const templates = settings?.email_templates || {}
  
  return {
    greeting: templates.greeting || 'いつもご利用いただきありがとうございます。',
    signature: templates.signature || 'MMQ予約システム',
    footer: templates.footer || '※このメールは自動送信されています。',
    templates,
  }
}

/**
 * 通知設定を取得（デフォルト: 全て有効）
 */
export async function getNotificationSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{
  newReservationEmail: boolean
  newReservationDiscord: boolean
  privateBookingEmail: boolean
  privateBookingDiscord: boolean
  shiftRequestDiscord: boolean
  reminderEmail: boolean
}> {
  const settings = await getOrganizationSettings(supabase, organizationId)
  const ns = settings?.notification_settings || {}
  
  return {
    newReservationEmail: ns.new_reservation_email !== false,
    newReservationDiscord: ns.new_reservation_discord !== false,
    privateBookingEmail: ns.private_booking_email !== false,
    privateBookingDiscord: ns.private_booking_discord !== false,
    shiftRequestDiscord: ns.shift_request_discord !== false,
    reminderEmail: ns.reminder_email !== false,
  }
}

/**
 * Discord通知を送信し、失敗時はキューに保存
 * @param supabase Supabaseクライアント
 * @param webhookUrl Discord Webhook URL
 * @param message メッセージペイロード
 * @param organizationId 組織ID
 * @param notificationType 通知タイプ
 * @param referenceId 関連ID（オプション）
 * @returns 送信成功したかどうか
 */
export async function sendDiscordNotificationWithRetry(
  supabase: SupabaseClient,
  webhookUrl: string,
  message: Record<string, unknown>,
  organizationId: string,
  notificationType: string,
  referenceId?: string
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })

    if (response.ok) {
      console.log('✅ Discord通知送信成功')
      return true
    }

    // 失敗時はキューに追加
    const errorText = await response.text()
    console.warn('⚠️ Discord通知失敗、キューに追加:', response.status)
    
    await supabase.from('discord_notification_queue').insert({
      organization_id: organizationId,
      webhook_url: webhookUrl,
      message_payload: message,
      notification_type: notificationType,
      reference_id: referenceId || null,
      status: 'pending',
      last_error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
      next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5分後にリトライ
    })

    return false
  } catch (error: unknown) {
    // ネットワークエラーなど
    console.error('❌ Discord通知エラー、キューに追加:', error)
    
    await supabase.from('discord_notification_queue').insert({
      organization_id: organizationId,
      webhook_url: webhookUrl,
      message_payload: message,
      notification_type: notificationType,
      reference_id: referenceId || null,
      status: 'pending',
      last_error: error instanceof Error ? error.message : 'Unknown error',
      next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    })

    return false
  }
}


