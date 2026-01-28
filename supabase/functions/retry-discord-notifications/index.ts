/**
 * Discord通知リトライ Edge Function
 * 
 * 失敗したDiscord通知をキューから取得し、再送信を試みる
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'

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

// Service Role Key による呼び出しかチェック
function isServiceRoleCall(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!authHeader || !serviceRoleKey) return false
  
  const token = authHeader.replace('Bearer ', '')
  return token === serviceRoleKey
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Service Role のみ許可（Cronジョブからの呼び出し）
    if (!isServiceRoleCall(req)) {
      console.warn('⚠️ 認証失敗: retry-discord-notifications への不正アクセス試行')
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    console.log('✅ Service Role Key 認証成功')

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // キューからリトライ対象を取得
    const { data: pendingNotifications, error: fetchError } = await serviceClient
      .from('discord_notification_queue')
      .select('*')
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

    for (const notification of pendingNotifications as QueuedNotification[]) {
      try {
        // Discord Webhookに送信
        const response = await fetch(notification.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

