/**
 * 予約確認メールのリトライキュー処理 Edge Function
 * 
 * 機能:
 * - booking_email_queue テーブルから未処理のメールを取得
 * - Resend APIでメール再送信
 * - 成功したら completed、3回失敗したら failed に更新
 * 
 * 実行方法:
 * - Supabase Cron で定期実行（5分ごと推奨）
 * - 手動実行: POST /functions/v1/process-booking-email-queue
 */

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'

interface QueueItem {
  id: string
  reservation_id: string
  organization_id: string
  email_type: string
  customer_email: string
  customer_name: string
  scenario_title: string
  event_date: string
  start_time: string
  end_time: string | null
  store_name: string
  store_address: string | null
  participant_count: number
  total_price: number
  reservation_number: string
  retry_count: number
  max_retries: number
}

// Service Role Key / Cron Secret による呼び出しかチェック
function isSystemCall(req: Request): boolean {
  return isCronOrServiceRoleCall(req)
}

function logAuthDebug(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const cronHeader =
    req.headers.get('x-cron-secret') ||
    req.headers.get('x-edge-cron-secret') ||
    req.headers.get('x-mmq-cron-secret') ||
    ''
  // 秘密は出さない（長さ/先頭数文字のみ）
  console.warn('auth_debug', {
    has_authorization: !!authHeader,
    token_prefix: token ? `${token.slice(0, 4)}…` : null,
    token_len: token ? token.length : 0,
    has_cron_secret: !!cronHeader,
    cron_prefix: cronHeader ? `${cronHeader.slice(0, 4)}…` : null,
    cron_len: cronHeader ? cronHeader.length : 0,
  })
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 認証チェック: Cron Secret / Service Role または管理者のみ
    if (!isSystemCall(req)) {
      logAuthDebug(req)
      const authResult = await verifyAuth(req, ['admin', 'owner', 'license_admin'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: process-booking-email-queue への不正アクセス試行')
        return errorResponse(
          authResult.error || '認証が必要です',
          authResult.statusCode || 401,
          corsHeaders
        )
      }
      console.log('✅ 管理者認証成功:', authResult.user?.email)
    } else {
      console.log('✅ システム認証成功（Cron/トリガー/Service）')
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    console.log('📧 予約確認メールリトライキュー処理開始')

    // 未処理のキューを取得（retry_count < max_retries）
    const { data: queueItems, error: fetchError } = await serviceClient
      .from('booking_email_queue')
      .select([
        'id',
        'reservation_id',
        'organization_id',
        'email_type',
        'customer_email',
        'customer_name',
        'scenario_title',
        'event_date',
        'start_time',
        'end_time',
        'store_name',
        'store_address',
        'participant_count',
        'total_price',
        'reservation_number',
        'retry_count',
        'max_retries',
        'status',
        'created_at',
      ].join(','))
      .in('status', ['pending', 'processing'])
      .lt('retry_count', 3)
      .order('created_at', { ascending: true })
      .limit(50)

    if (fetchError) {
      throw fetchError
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('📭 処理対象のキューなし')
      return new Response(
        JSON.stringify({ success: true, processed: 0, succeeded: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`📬 処理対象: ${queueItems.length}件`)

    let succeeded = 0
    let failed = 0

    for (const item of queueItems as QueueItem[]) {
      try {
        // ステータスを processing に更新
        await serviceClient
          .from('booking_email_queue')
          .update({
            status: 'processing',
            retry_count: item.retry_count + 1,
            last_retry_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)

        // メール送信
        const emailResult = await sendEmail(serviceClient, item)

        if (emailResult.success) {
          // 成功
          await serviceClient
            .from('booking_email_queue')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id)
          
          console.log(`✅ メール送信成功: ${item.reservation_number}`)
          succeeded++
        } else {
          // 失敗
          const newRetryCount = item.retry_count + 1
          const newStatus = newRetryCount >= item.max_retries ? 'failed' : 'pending'
          
          await serviceClient
            .from('booking_email_queue')
            .update({
              status: newStatus,
              last_error: emailResult.error,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.id)
          
          console.log(`❌ メール送信失敗: ${item.reservation_number} (${newRetryCount}/${item.max_retries})`)
          failed++
        }
      } catch (itemError) {
        console.error(`❌ キュー処理エラー: ${item.id}`, itemError)
        
        // エラー時はpendingに戻す（次回リトライ）
        await serviceClient
          .from('booking_email_queue')
          .update({
            status: 'pending',
            last_error: sanitizeErrorMessage(itemError instanceof Error ? itemError.message : String(itemError)),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)
        
        failed++
      }
    }

    console.log(`📊 処理完了: 成功=${succeeded}, 失敗=${failed}`)

    return new Response(
      JSON.stringify({
        success: true,
        processed: queueItems.length,
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
        error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

/**
 * メールを送信
 */
async function sendEmail(
  supabase: ReturnType<typeof createClient>,
  item: QueueItem
): Promise<{ success: boolean; error?: string }> {
  try {
    // 組織のメール設定を取得
    const emailSettings = await getEmailSettings(supabase, item.organization_id)
    
    if (!emailSettings.resendApiKey) {
      return { success: false, error: 'Resend API Key が設定されていません' }
    }

    // 日付フォーマット（JST固定）
    const formatDate = (dateStr: string): string => {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00+09:00`)
      const parts = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'narrow',
      }).formatToParts(d)
      const year = parts.find(p => p.type === 'year')?.value ?? ''
      const month = parts.find(p => p.type === 'month')?.value ?? ''
      const day = parts.find(p => p.type === 'day')?.value ?? ''
      const wd = parts.find(p => p.type === 'weekday')?.value ?? ''
      return `${year}年${month}月${day}日(${wd})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // メール本文
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>予約確認</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0; font-size: 24px;">ご予約ありがとうございます</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">${item.customer_name} 様</p>
    <p style="font-size: 14px; color: #666;">マーダーミステリーの予約が完了いたしました。</p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">予約内容</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">予約番号</td><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">${item.reservation_number}</td></tr>
      <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">シナリオ</td><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">${item.scenario_title}</td></tr>
      <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">${formatDate(item.event_date)}<br>${formatTime(item.start_time)}${item.end_time ? ' - ' + formatTime(item.end_time) : ''}</td></tr>
      <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">${item.store_name}${item.store_address ? '<br><span style="font-size: 13px; color: #6b7280;">' + item.store_address + '</span>' : ''}</td></tr>
      <tr><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td><td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">${item.participant_count}名</td></tr>
      <tr><td style="padding: 12px 0; font-weight: bold; color: #6b7280;">お支払い金額</td><td style="padding: 12px 0; color: #2563eb; font-size: 18px; font-weight: bold;">¥${item.total_price.toLocaleString()}</td></tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">重要事項</h3>
    <ul style="margin: 0; padding-left: 20px; color: #92400e;">
      <li>当日は開始時刻の<strong>15分前</strong>までにご来場ください</li>
      <li>お支払いは<strong>現地決済</strong>となります</li>
      <li>キャンセルは公演開始の<strong>24時間前</strong>まで無料です</li>
    </ul>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p>MMQ</p>
    <p>このメールは予約完了時に自動送信されています</p>
  </div>
</body>
</html>
    `

    const emailText = `
${item.customer_name} 様

ご予約ありがとうございます。

予約番号: ${item.reservation_number}
シナリオ: ${item.scenario_title}
日時: ${formatDate(item.event_date)} ${formatTime(item.start_time)}
会場: ${item.store_name}
参加人数: ${item.participant_count}名
お支払い金額: ¥${item.total_price.toLocaleString()}

当日は開始時刻の15分前までにご来場ください。

MMQ
    `

    // Resend APIでメール送信
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${emailSettings.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
        to: [item.customer_email],
        subject: `【予約完了】${item.scenario_title} - ${formatDate(item.event_date)}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: JSON.stringify(errorData) }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
