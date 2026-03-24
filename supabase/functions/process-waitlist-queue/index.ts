/**
 * キャンセル待ち通知リトライキュー処理 Edge Function
 * 
 * 失敗したキャンセル待ち通知を自動でリトライする。
 * Cronで5分ごとに実行され、pending状態のキューを処理する。
 * 
 * 処理フロー:
 * 1. waitlist_notification_queue から pending 状態のレコードを取得
 * 2. 各レコードに対してメール送信処理を実行
 * 3. 成功: status = 'completed' に更新
 * 4. 失敗: retry_count をインクリメント、最大3回まで
 * 5. 3回失敗: status = 'failed' に更新
 */

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall, maskEmail } from '../_shared/security.ts'

interface QueueEntry {
  id: string
  schedule_event_id: string
  organization_id: string
  freed_seats: number
  scenario_title: string
  event_date: string
  start_time: string
  end_time: string
  store_name: string
  booking_url: string
  retry_count: number
  last_error: string | null
}

interface WaitlistEntry {
  id: string
  customer_name: string
  customer_email: string
  participant_count: number
  status: string
  created_at: string
}

const MAX_RETRIES = 3

// Cron Secret / Service Role Key による呼び出しかチェック（Cron向け）
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
    // 🔒 システム呼び出しのみ許可（Cron/トリガー/Service）
    if (!isSystemCall(req)) {
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    console.log('🔄 Starting waitlist queue processing...')

    // pending または retry_count < MAX_RETRIES のキューを取得
    const { data: queueEntries, error: queueError } = await serviceClient
      .from('waitlist_notification_queue')
      .select([
        'id',
        'schedule_event_id',
        'organization_id',
        'freed_seats',
        'scenario_title',
        'event_date',
        'start_time',
        'end_time',
        'store_name',
        'booking_url',
        'retry_count',
        'last_error',
        'status',
        'created_at',
      ].join(','))
      .eq('status', 'pending')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(10) // 1回の実行で最大10件まで処理

    if (queueError) {
      console.error('Queue fetch error:', queueError)
      throw new Error('キューの取得に失敗しました')
    }

    if (!queueEntries || queueEntries.length === 0) {
      console.log('✅ No pending queue entries')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '処理対象のキューはありませんでした',
          processedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`📋 Found ${queueEntries.length} queue entries to process`)

    // 各キューエントリーを処理
    const results = await Promise.all(
      queueEntries.map(entry => processQueueEntry(serviceClient, entry))
    )

    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    console.log(`✅ Processed: ${successCount} success, ${failedCount} failed`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${queueEntries.length}件のキューを処理しました`,
        processedCount: queueEntries.length,
        successCount,
        failedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('❌ Error:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizeErrorMessage(msg || 'キュー処理に失敗しました') 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

/**
 * 個別のキューエントリーを処理
 */
async function processQueueEntry(
  serviceClient: any,
  entry: QueueEntry
): Promise<{ success: boolean; entryId: string; error?: string }> {
  console.log(`🔄 Processing queue entry ${entry.id} (retry: ${entry.retry_count})`)

  // ステータスを processing に更新
  await serviceClient
    .from('waitlist_notification_queue')
    .update({ 
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', entry.id)

  try {
    // メール設定を取得
    const emailSettings = entry.organization_id 
      ? await getEmailSettings(serviceClient, entry.organization_id)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not set')
    }

    // 該当イベントのキャンセル待ちを取得（waiting状態のもの、登録順）
    const { data: waitlistEntries, error: waitlistError } = await serviceClient
      .from('waitlist')
      .select('id, customer_name, customer_email, participant_count, status, created_at')
      .eq('schedule_event_id', entry.schedule_event_id)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })

    if (waitlistError) {
      throw new Error(`Waitlist fetch error: ${waitlistError.message}`)
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      console.log(`✅ No waitlist entries for event ${entry.schedule_event_id}`)
      
      // キューを completed に更新（通知対象がいない場合も正常終了）
      await serviceClient
        .from('waitlist_notification_queue')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', entry.id)

      return { success: true, entryId: entry.id }
    }

    // 空き席数分だけ通知
    let remainingSeats = entry.freed_seats
    const notifiedEntries: WaitlistEntry[] = []

    for (const waitlistEntry of waitlistEntries) {
      if (remainingSeats > 0) {
        notifiedEntries.push(waitlistEntry)
        remainingSeats -= waitlistEntry.participant_count
      }
    }

    if (notifiedEntries.length === 0) {
      console.log(`✅ No entries to notify for event ${entry.schedule_event_id}`)
      
      await serviceClient
        .from('waitlist_notification_queue')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', entry.id)

      return { success: true, entryId: entry.id }
    }

    // 24時間後を回答期限として設定
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // 各エントリーにメール送信
    const emailResults = await Promise.all(
      notifiedEntries.map(waitlistEntry => 
        sendNotificationEmail(
          serviceClient,
          waitlistEntry,
          entry,
          expiresAt,
          resendApiKey!,
          senderEmail,
          senderName
        )
      )
    )

    const emailSuccessCount = emailResults.filter(r => r.success).length

    if (emailSuccessCount > 0) {
      // 1件以上成功したら completed に更新
      await serviceClient
        .from('waitlist_notification_queue')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', entry.id)

      console.log(`✅ Queue entry ${entry.id} completed (${emailSuccessCount}/${notifiedEntries.length} emails sent)`)
      return { success: true, entryId: entry.id }
    } else {
      // 全て失敗した場合
      throw new Error('全てのメール送信に失敗しました')
    }

  } catch (error) {
    console.error(`❌ Error processing queue entry ${entry.id}:`, error)
    const msg = error instanceof Error ? error.message : String(error)

    // リトライカウントをインクリメント
    const newRetryCount = entry.retry_count + 1
    const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'pending'

    await serviceClient
      .from('waitlist_notification_queue')
      .update({ 
        status: newStatus,
        retry_count: newRetryCount,
        last_retry_at: new Date().toISOString(),
        last_error: sanitizeErrorMessage(msg || 'Unknown error'),
        updated_at: new Date().toISOString()
      })
      .eq('id', entry.id)

    return { 
      success: false, 
      entryId: entry.id, 
      error: sanitizeErrorMessage(msg) 
    }
  }
}

/**
 * 通知メールを送信
 */
async function sendNotificationEmail(
  serviceClient: any,
  waitlistEntry: WaitlistEntry,
  queueEntry: QueueEntry,
  expiresAt: string,
  resendApiKey: string,
  senderEmail: string,
  senderName: string
): Promise<{ success: boolean; entryId: string; error?: string }> {
  
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

  const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>空席のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #d1fae5; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #065f46; margin-top: 0; font-size: 24px;">
      🎉 空席のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${waitlistEntry.customer_name} 様
    </p>
    <p style="font-size: 14px; color: #047857;">
      キャンセル待ちにご登録いただいていた公演に空きが出ました！
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
      空きが出た公演
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${queueEntry.scenario_title}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(queueEntry.event_date)}<br>
          ${formatTime(queueEntry.start_time)} - ${formatTime(queueEntry.end_time)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${queueEntry.store_name}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">ご希望人数</td>
        <td style="padding: 12px 0; color: #1f2937;">${waitlistEntry.participant_count}名</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">⏰ お早めにご予約ください</h3>
    <p style="margin: 0; color: #92400e;">
      先着順となっております。<br>
      <strong>24時間以内</strong>にご予約いただけない場合、次の方に通知されます。
    </p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${queueEntry.booking_url}" style="display: inline-block; background-color: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">
      今すぐ予約する
    </a>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      予約が完了しましたら、キャンセル待ちは自動的に解除されます。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">MMQ</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
  `

  const emailText = `
${waitlistEntry.customer_name} 様

🎉 空席のお知らせ

キャンセル待ちにご登録いただいていた公演に空きが出ました！

━━━━━━━━━━━━━━━━━━━━
空きが出た公演
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${queueEntry.scenario_title}
日時: ${formatDate(queueEntry.event_date)} ${formatTime(queueEntry.start_time)} - ${formatTime(queueEntry.end_time)}
会場: ${queueEntry.store_name}
ご希望人数: ${waitlistEntry.participant_count}名

━━━━━━━━━━━━━━━━━━━━
⏰ お早めにご予約ください
━━━━━━━━━━━━━━━━━━━━

先着順となっております。
24時間以内にご予約いただけない場合、次の方に通知されます。

▼ 今すぐ予約する
${queueEntry.booking_url}

━━━━━━━━━━━━━━━━━━━━

予約が完了しましたら、キャンセル待ちは自動的に解除されます。

MMQ
このメールは自動送信されています
  `

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [waitlistEntry.customer_email],
        subject: `【空席のお知らせ】${queueEntry.scenario_title} - ${formatDate(queueEntry.event_date)}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error for', maskEmail(waitlistEntry.customer_email), ':', errorData)
      return { success: false, entryId: waitlistEntry.id, error: JSON.stringify(errorData) }
    }

    // ステータスを「notified」に更新し、期限を設定
    const { error: updateError } = await serviceClient
      .from('waitlist')
      .update({ 
        status: 'notified', 
        notified_at: new Date().toISOString(),
        expires_at: expiresAt
      })
      .eq('id', waitlistEntry.id)

    if (updateError) {
      console.error('Waitlist update error:', updateError)
    }

    console.log('✅ Email sent to:', maskEmail(waitlistEntry.customer_email))
    return { success: true, entryId: waitlistEntry.id }
  } catch (err) {
    console.error('❌ Email send error for', maskEmail(waitlistEntry.customer_email), ':', err)
    return { success: false, entryId: waitlistEntry.id, error: err.message }
  }
}

