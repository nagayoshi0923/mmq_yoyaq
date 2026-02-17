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
 * 
 * 注意: sender_email はResendで検証済みのドメインが必要なため、
 * organization_settings の設定は使用せず、環境変数のみを使用する。
 * 組織ごとのメールアドレス設定は reply_to_email で対応する。
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
  
  // sender_email は環境変数固定（Resend検証済みドメインが必要）
  // 組織ごとの設定は reply_to_email で対応
  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
  const senderName = Deno.env.get('SENDER_NAME') || 'MMQ予約システム'
  
  return {
    resendApiKey: settings?.resend_api_key || Deno.env.get('RESEND_API_KEY') || null,
    senderEmail,
    senderName,
    // reply_to_email は組織設定を優先（お客様の返信先として使用）
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
 * 店舗のメール設定（テンプレート・会社情報）を取得
 * email_settings テーブルから取得
 */
export interface StoreEmailSettings {
  company_name: string | null
  company_email: string | null
  company_phone: string | null
  company_address: string | null
  reservation_confirmation_template: string | null
  cancellation_template: string | null
  reminder_template: string | null
  booking_change_template: string | null
  private_request_template: string | null
  private_confirm_template: string | null
  private_cancellation_template: string | null
  private_rejection_template: string | null
  waitlist_notify_template: string | null
  waitlist_registration_template: string | null
  performance_cancellation_template: string | null
  event_cancellation_template: string | null
  performance_extension_template: string | null
}

export async function getStoreEmailSettings(
  supabase: SupabaseClient,
  options: { storeId?: string; organizationId?: string }
): Promise<StoreEmailSettings | null> {
  let query = supabase
    .from('email_settings')
    .select([
      'company_name',
      'company_email',
      'company_phone',
      'company_address',
      'reservation_confirmation_template',
      'cancellation_template',
      'reminder_template',
      'booking_change_template',
      'private_request_template',
      'private_confirm_template',
      'private_cancellation_template',
      'private_rejection_template',
      'waitlist_notify_template',
      'waitlist_registration_template',
      'performance_cancellation_template',
      'event_cancellation_template',
      'performance_extension_template',
    ].join(','))

  // store_id が指定されている場合はそれを優先
  if (options.storeId) {
    query = query.eq('store_id', options.storeId)
  } else if (options.organizationId) {
    // organization_id のみ指定されている場合は組織の最初の設定を取得
    query = query.eq('organization_id', options.organizationId)
  } else {
    return null
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error('店舗メール設定取得エラー:', error)
    return null
  }

  return data
}

/**
 * メールテンプレートの変数を置換
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | number | undefined>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`
    result = result.split(placeholder).join(String(value ?? ''))
  }
  return result
}

/**
 * 日付をフォーマット（曜日付き）
 */
export function formatDateJa(dateStr: string): string {
  const date = new Date(dateStr)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
}

/**
 * 時刻をフォーマット（HH:MM形式）
 */
export function formatTimeJa(timeStr: string): string {
  return timeStr.slice(0, 5)
}

/**
 * 基本変数セットのインターフェース
 * 全メールテンプレートで共通して使用可能な変数
 */
export interface BaseTemplateVariables {
  // 顧客情報
  customer_name: string
  customer_email?: string
  
  // 予約情報
  reservation_number?: string
  scenario_title: string
  date: string
  time: string
  end_time?: string
  venue: string
  participants: string
  total_price?: string
  
  // キャンセル関連
  cancellation_fee?: string
  cancellation_reason?: string
  
  // 会社情報
  company_name: string
  company_phone?: string
  company_email?: string
  
  // その他
  booking_url?: string
  current_participants?: string
  max_participants?: string
}

/**
 * 予約情報から基本変数セットを生成
 */
export function buildBaseTemplateVariables(params: {
  customerName: string
  customerEmail?: string
  reservationNumber?: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime?: string
  storeName: string
  participantCount: number
  totalPrice?: number
  cancellationFee?: number
  cancellationReason?: string
  companyName: string
  companyPhone?: string
  companyEmail?: string
  bookingUrl?: string
  currentParticipants?: number
  maxParticipants?: number
}): Record<string, string> {
  const variables: Record<string, string> = {
    // 顧客情報
    customer_name: params.customerName,
    
    // 予約情報
    scenario_title: params.scenarioTitle,
    date: formatDateJa(params.eventDate),
    time: formatTimeJa(params.startTime),
    venue: params.storeName,
    participants: `${params.participantCount}`,
    participant_count: `${params.participantCount}`,
    
    // 会社情報
    company_name: params.companyName,
  }
  
  // オプション項目
  if (params.customerEmail) {
    variables.customer_email = params.customerEmail
  }
  if (params.reservationNumber) {
    variables.reservation_number = params.reservationNumber
  }
  if (params.endTime) {
    variables.end_time = formatTimeJa(params.endTime)
  }
  if (params.totalPrice !== undefined) {
    variables.total_price = params.totalPrice.toLocaleString()
  }
  if (params.cancellationFee !== undefined) {
    variables.cancellation_fee = params.cancellationFee.toLocaleString()
  }
  if (params.cancellationReason) {
    variables.cancellation_reason = params.cancellationReason
  }
  if (params.companyPhone) {
    variables.company_phone = params.companyPhone
  }
  if (params.companyEmail) {
    variables.company_email = params.companyEmail
  }
  if (params.bookingUrl) {
    variables.booking_url = params.bookingUrl
  }
  if (params.currentParticipants !== undefined) {
    variables.current_participants = `${params.currentParticipants}`
  }
  if (params.maxParticipants !== undefined) {
    variables.max_participants = `${params.maxParticipants}`
  }
  
  return variables
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


