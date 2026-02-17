/**
 * 公演中止判定 Edge Function
 * 
 * 機能:
 * 1. 前日23:59チェック: 満席でなければ過半数以上なら延長、未満なら中止
 * 2. 4時間前チェック: 延長された公演で満席でなければ中止
 * 3. 中止時は予約者にメール + Discordに通知（GMメンション付き）
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall, maskEmail } from '../_shared/security.ts'
import { getEmailSettings, getDiscordSettings, sendDiscordNotificationWithRetry } from '../_shared/organization-settings.ts'

interface CheckRequest {
  check_type: 'day_before' | 'four_hours_before'
}

interface EventDetail {
  event_id: string
  date: string
  start_time: string
  scenario: string
  store_name: string
  current_participants: number
  max_participants: number
  half_required?: number
  result: 'confirmed' | 'extended' | 'cancelled'
  organization_id: string
  gms: string[]
}

// Cron Secret / Service Role Key による呼び出しかチェック
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
    // 認証チェック: Cron/システム または管理者のみ
    if (!isSystemCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'owner', 'license_admin'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: check-performance-cancellation への不正アクセス試行')
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

    const { check_type }: CheckRequest = await req.json()
    console.log('🔍 公演中止チェック開始:', check_type)

    let result: {
      events_checked: number
      events_confirmed: number
      events_extended?: number
      events_cancelled: number
      details: EventDetail[]
    }

    // RPC関数を実行
    if (check_type === 'day_before') {
      const { data, error } = await serviceClient.rpc('check_performances_day_before')
      if (error) throw error
      result = data
    } else if (check_type === 'four_hours_before') {
      const { data, error } = await serviceClient.rpc('check_performances_four_hours_before')
      if (error) throw error
      result = data
    } else {
      throw new Error('Invalid check_type')
    }

    console.log('📊 チェック結果:', {
      checked: result.events_checked,
      confirmed: result.events_confirmed,
      extended: result.events_extended,
      cancelled: result.events_cancelled
    })

    // 中止・延長された公演に対して通知を送信
    const notifications: Promise<void>[] = []
    
    for (const event of result.details) {
      if (event.result === 'cancelled') {
        // 中止通知を送信
        notifications.push(
          sendCancellationNotifications(serviceClient, event, check_type)
        )
      } else if (event.result === 'extended') {
        // 延長通知（Discord のみ）
        notifications.push(
          sendExtensionNotification(serviceClient, event)
        )
      }
    }

    await Promise.allSettled(notifications)

    return new Response(
      JSON.stringify({
        success: true,
        check_type,
        ...result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(error.message || '公演中止チェックに失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

/**
 * 中止通知を送信（メール + Discord）
 */
async function sendCancellationNotifications(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail,
  checkType: string
): Promise<void> {
  console.log('📧 中止通知送信開始:', event.event_id)

  // 1. 予約者一覧を取得
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)
  
  // 3. 各予約者にメール送信
  if (reservations && reservations.length > 0 && emailSettings.resendApiKey) {
    for (const reservation of reservations) {
      if (!reservation.customer_email) continue

      try {
        await sendCancellationEmail(
          emailSettings,
          reservation.customer_email,
          reservation.customer_name || 'お客様',
          event
        )
        console.log('✅ 中止メール送信:', maskEmail(reservation.customer_email))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(reservation.customer_email), emailError)
      }
    }

    // 予約をキャンセル状態に更新
    const reservationIds = reservations.map(r => r.id)
    await supabase
      .from('reservations')
      .update({
        status: 'cancelled',
        is_cancelled: true,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: checkType === 'day_before' 
          ? '人数未達による公演中止（前日判定）' 
          : '人数未達による公演中止（4時間前判定）'
      })
      .in('id', reservationIds)
  }

  // 3.5. イベント自体を中止状態に更新
  const { error: eventUpdateError } = await supabase
    .from('schedule_events')
    .update({
      is_cancelled: true
    })
    .eq('id', event.event_id)
  
  if (eventUpdateError) {
    console.error('❌ イベント中止フラグ更新エラー:', eventUpdateError)
  } else {
    console.log('✅ イベント中止フラグ更新完了:', event.event_id)
  }

  // 4. Discord通知（GMメンション付き）
  await sendDiscordCancellationNotification(supabase, event, checkType, reservations?.length || 0)

  // 5. ログを更新
  await supabase
    .from('performance_cancellation_logs')
    .update({
      notified_customers: reservations?.length || 0,
      notified_gms: event.gms || []
    })
    .eq('schedule_event_id', event.event_id)
    .eq('check_type', checkType)
}

/**
 * 中止メールを送信
 */
async function sendCancellationEmail(
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
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
  <title>公演中止のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef2f2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #dc2626; margin-top: 0; font-size: 24px;">
      ⚠️ 公演中止のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #991b1b;">
      誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
      中止となった公演
    </h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.scenario}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(event.date)}<br>
          ${formatTime(event.start_time)}〜
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ご迷惑をおかけして誠に申し訳ございません。<br>
      またのご予約をお待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
  `

  const emailText = `
${customerName} 様

⚠️ 公演中止のお知らせ

誠に申し訳ございませんが、ご予約いただいておりました公演は人数未達のため中止となりました。

━━━━━━━━━━━━━━━━━━━━
中止となった公演
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}

━━━━━━━━━━━━━━━━━━━━

ご迷惑をおかけして誠に申し訳ございません。
またのご予約をお待ちしております。

${emailSettings.senderName}
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: `【公演中止のお知らせ】${event.scenario} - ${event.date}`,
      html: emailHtml,
      text: emailText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }
}

/**
 * Discord に中止通知を送信（GMメンション付き）
 */
async function sendDiscordCancellationNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail,
  checkType: string,
  customerCount: number
): Promise<void> {
  const discordSettings = await getDiscordSettings(supabase, event.organization_id)
  
  if (!discordSettings.webhookUrl) {
    console.log('Discord Webhook未設定、通知スキップ')
    return
  }

  // GMのDiscord IDを取得してメンション文字列を作成
  let gmMentions = ''
  if (event.gms && event.gms.length > 0) {
    const { data: staffList } = await supabase
      .from('staff')
      .select('name, discord_user_id')
      .in('name', event.gms)
      .eq('organization_id', event.organization_id)

    if (staffList && staffList.length > 0) {
      const mentions = staffList
        .filter(s => s.discord_user_id)
        .map(s => `<@${s.discord_user_id}>`)
      gmMentions = mentions.join(' ')
    }
  }

  const checkTypeLabel = checkType === 'day_before' ? '前日判定' : '4時間前判定'

  const message = {
    content: gmMentions || undefined,
    embeds: [{
      title: '⚠️ 公演中止',
      color: 0xdc2626, // 赤
      fields: [
        {
          name: 'シナリオ',
          value: event.scenario || '未設定',
          inline: true
        },
        {
          name: '日時',
          value: `${event.date} ${event.start_time?.slice(0, 5) || ''}`,
          inline: true
        },
        {
          name: '会場',
          value: event.store_name || '未定',
          inline: true
        },
        {
          name: '参加者',
          value: `${event.current_participants}/${event.max_participants}名（人数未達）`,
          inline: true
        },
        {
          name: '判定',
          value: checkTypeLabel,
          inline: true
        },
        {
          name: '通知済み予約者',
          value: `${customerCount}名`,
          inline: true
        }
      ],
      footer: {
        text: 'MMQ 公演中止判定システム'
      },
      timestamp: new Date().toISOString()
    }]
  }

  // リトライ機能付きで送信
  const success = await sendDiscordNotificationWithRetry(
    supabase,
    discordSettings.webhookUrl,
    message,
    event.organization_id,
    'performance_cancel',
    event.event_id
  )
  
  if (success) {
    console.log('✅ Discord中止通知送信完了')
  } else {
    console.log('⚠️ Discord中止通知失敗、リトライキューに追加')
  }
}

/**
 * 募集延長通知を送信（Discord のみ）
 */
async function sendExtensionNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail
): Promise<void> {
  const discordSettings = await getDiscordSettings(supabase, event.organization_id)
  
  if (!discordSettings.webhookUrl) {
    console.log('Discord Webhook未設定、通知スキップ')
    return
  }

  // GMのDiscord IDを取得してメンション文字列を作成
  let gmMentions = ''
  if (event.gms && event.gms.length > 0) {
    const { data: staffList } = await supabase
      .from('staff')
      .select('name, discord_user_id')
      .in('name', event.gms)
      .eq('organization_id', event.organization_id)

    if (staffList && staffList.length > 0) {
      const mentions = staffList
        .filter(s => s.discord_user_id)
        .map(s => `<@${s.discord_user_id}>`)
      gmMentions = mentions.join(' ')
    }
  }

  const message = {
    content: gmMentions || undefined,
    embeds: [{
      title: '⏰ 募集延長',
      color: 0xf59e0b, // オレンジ
      description: '過半数に達しているため、公演4時間前まで募集を延長します。',
      fields: [
        {
          name: 'シナリオ',
          value: event.scenario || '未設定',
          inline: true
        },
        {
          name: '日時',
          value: `${event.date} ${event.start_time?.slice(0, 5) || ''}`,
          inline: true
        },
        {
          name: '会場',
          value: event.store_name || '未定',
          inline: true
        },
        {
          name: '現在の参加者',
          value: `${event.current_participants}/${event.max_participants}名`,
          inline: true
        },
        {
          name: '必要人数',
          value: `あと${event.max_participants - event.current_participants}名`,
          inline: true
        }
      ],
      footer: {
        text: '公演4時間前に最終判定を行います'
      },
      timestamp: new Date().toISOString()
    }]
  }

  // リトライ機能付きで送信
  const success = await sendDiscordNotificationWithRetry(
    supabase,
    discordSettings.webhookUrl,
    message,
    event.organization_id,
    'performance_extend',
    event.event_id
  )
  
  if (success) {
    console.log('✅ Discord延長通知送信完了')
  } else {
    console.log('⚠️ Discord延長通知失敗、リトライキューに追加')
  }
}

