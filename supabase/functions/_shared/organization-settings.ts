/**
 * Edge Functions共通: 組織設定取得ヘルパー
 * 
 * 使用方法:
 * import { getOrganizationSettings, getDiscordSettings, getEmailSettings } from '../_shared/organization-settings.ts'
 * 
 * const settings = await getOrganizationSettings(supabaseClient, organizationId)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    .select('*')
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


