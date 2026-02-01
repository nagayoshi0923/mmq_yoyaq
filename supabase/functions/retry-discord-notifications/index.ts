/**
 * Discord通知リトライ Edge Function
 * 
 * 失敗したDiscord通知をキューから取得し、再送信を試みる
 */

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'
import { getDiscordSettings, getNotificationSettings } from '../_shared/organization-settings.ts'

interface QueuedNotification {
  id: string
  organization_id: string
  webhook_url: string
  message_payload: Record<string, unknown>
  notification_type: string
  reference_id: string | null
  retry_count: number
  max_retries: number
}

function isAllowedDiscordUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    if (url.port && url.port !== '443') return false

    // allowlist: Discord公式ドメインのみ
    const allowedHosts = new Set([
      'discord.com',
      'discordapp.com',
      'canary.discord.com',
      'ptb.discord.com',
    ])
    if (!allowedHosts.has(url.hostname)) return false

    // bot channel API or webhook API のみ許可
    const p = url.pathname
    const isChannelApi =
      /^\/api\/v\d+\/channels\/\d+\/messages\/?$/.test(p) ||
      /^\/api\/channels\/\d+\/messages\/?$/.test(p)
    const isWebhook =
      /^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(p) ||
      /^\/api\/v\d+\/webhooks\/\d+\/[^/]+\/?$/.test(p)

    return isChannelApi || isWebhook
  } catch (_e) {
    return false
  }
}

function isDiscordChannelApi(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.hostname === 'discord.com' &&
      /^\/api\/v\d+\/channels\/\d+\/messages\/?$/.test(u.pathname)
    )
  } catch (_e) {
    return false
  }
}

const PRIVATE_BOOKING_RATE_LIMIT_PER_MINUTE =
  parseInt(Deno.env.get('PRIVATE_BOOKING_DISCORD_RATE_LIMIT_PER_MINUTE') || '3', 10) || 3

async function getSentCountLastMinute(serviceClient: any, organizationId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 1000).toISOString()
  const { count, error } = await serviceClient
    .from('discord_notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('notification_type', 'private_booking_request')
    .eq('status', 'completed')
    .gte('updated_at', since)

  if (error) {
    console.warn('⚠️ 送信数カウント取得に失敗（レート制限が効かない可能性）:', error)
    return 0
  }
  return count || 0
}

// Service Role Key / Cron Secret による呼び出しかチェック
function isSystemCall(req: Request): boolean {
  return isCronOrServiceRoleCall(req)
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // システム呼び出しのみ許可（Cron/トリガー/Service）
    if (!isSystemCall(req)) {
      console.warn('⚠️ 認証失敗: retry-discord-notifications への不正アクセス試行')
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    console.log('✅ システム認証成功（Cron/トリガー/Service）')

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // キューからリトライ対象を取得
    const { data: pendingNotifications, error: fetchError } = await serviceClient
      .from('discord_notification_queue')
      .select([
        'id',
        'organization_id',
        'webhook_url',
        'message_payload',
        'notification_type',
        'reference_id',
        'retry_count',
        'max_retries',
        'next_retry_at',
        'status',
        'created_at',
        'updated_at',
      ].join(','))
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 3) // max_retriesのデフォルト値
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) {
      console.error('キュー取得エラー:', fetchError)
      throw new Error(sanitizeErrorMessage(fetchError.message))
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log('📭 リトライ対象の通知なし')
      return new Response(
        JSON.stringify({ success: true, processed: 0, succeeded: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`📬 ${pendingNotifications.length}件の通知をリトライ`)

    let succeeded = 0
    let failed = 0
    const privateBookingSentCountCache = new Map<string, number>() // orgId -> last-minute count + this-run count

    for (const notification of pendingNotifications as QueuedNotification[]) {
      try {
        // 🔒 URL検証（SSRF/任意ホスト送信の防止）
        if (!isAllowedDiscordUrl(notification.webhook_url)) {
          await serviceClient
            .from('discord_notification_queue')
            .update({
              status: 'failed',
              last_error: 'invalid_discord_url',
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id)
          console.error('❌ 不正なDiscord URLのため送信不可:', notification.id)
          continue
        }

        // 通知種別ごとのON/OFF（キルスイッチ）
        // private booking をOFFにしている場合は送らない（大量送信の再発防止）
        if (notification.notification_type === 'private_booking_request') {
          const ns = await getNotificationSettings(serviceClient, notification.organization_id)
          if (!ns.privateBookingDiscord) {
            await serviceClient
              .from('discord_notification_queue')
              .update({
                status: 'failed',
                last_error: 'notifications_disabled',
                updated_at: new Date().toISOString()
              })
              .eq('id', notification.id)
            console.warn('⏭️ Discord通知スキップ（無効設定）:', notification.id)
            continue
          }

          // 異常時対策: 1分あたりの送信上限（org単位）
          let sent = privateBookingSentCountCache.get(notification.organization_id)
          if (sent === undefined) {
            sent = await getSentCountLastMinute(serviceClient, notification.organization_id)
            privateBookingSentCountCache.set(notification.organization_id, sent)
          }

          if (sent >= PRIVATE_BOOKING_RATE_LIMIT_PER_MINUTE) {
            // 失敗扱いにせず後ろへ回す（retry_countも増やさない）
            await serviceClient
              .from('discord_notification_queue')
              .update({
                last_error: `rate_limited_${PRIVATE_BOOKING_RATE_LIMIT_PER_MINUTE}_per_min`,
                next_retry_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2分後に再試行
                updated_at: new Date().toISOString()
              })
              .eq('id', notification.id)
            console.warn('⏭️ Discord通知レート制限で延期:', notification.id)
            continue
          }

          // 送信するので、この実行分のカウントを先に積む
          privateBookingSentCountCache.set(notification.organization_id, sent + 1)
        }

        // Discordへ送信（Webhook or Bot）
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }

        if (isDiscordChannelApi(notification.webhook_url)) {
          const discord = await getDiscordSettings(serviceClient, notification.organization_id)
          if (!discord.botToken) {
            await serviceClient
              .from('discord_notification_queue')
              .update({
                status: 'failed',
                last_error: 'bot_token_not_configured',
                updated_at: new Date().toISOString()
              })
              .eq('id', notification.id)
            console.error('❌ Bot Token未設定のため送信不可:', notification.id)
            continue
          }
          headers['Authorization'] = `Bot ${discord.botToken}`
        }

        const response = await fetch(notification.webhook_url, {
          method: 'POST',
          headers,
          body: JSON.stringify(notification.message_payload)
        })

        if (response.ok) {
          // 成功: ステータスを更新
          await serviceClient
            .from('discord_notification_queue')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id)

          console.log('✅ Discord通知成功:', notification.id)
          succeeded++
        } else {
          // 失敗: リトライカウントを増やす
          const errorText = await response.text()
          const newRetryCount = notification.retry_count + 1
          const nextRetryMinutes = 5 * Math.pow(2, newRetryCount) // 指数バックオフ

          await serviceClient
            .from('discord_notification_queue')
            .update({
              retry_count: newRetryCount,
              last_error: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
              next_retry_at: new Date(Date.now() + nextRetryMinutes * 60 * 1000).toISOString(),
              status: newRetryCount >= notification.max_retries ? 'failed' : 'pending',
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id)

          console.warn('⚠️ Discord通知失敗:', notification.id, response.status)
          failed++
        }
      } catch (sendError) {
        // ネットワークエラーなど
        const newRetryCount = notification.retry_count + 1
        const nextRetryMinutes = 5 * Math.pow(2, newRetryCount)

        await serviceClient
          .from('discord_notification_queue')
          .update({
            retry_count: newRetryCount,
            last_error: sanitizeErrorMessage(sendError.message || 'Unknown error'),
            next_retry_at: new Date(Date.now() + nextRetryMinutes * 60 * 1000).toISOString(),
            status: newRetryCount >= notification.max_retries ? 'failed' : 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', notification.id)

        console.error('❌ Discord通知エラー:', notification.id, sendError)
        failed++
      }
    }

    console.log(`📊 リトライ結果: 成功=${succeeded}, 失敗=${failed}`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingNotifications.length,
        succeeded,
        failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(error.message || 'Discord通知リトライに失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

