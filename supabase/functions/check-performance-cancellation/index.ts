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
import { getEmailSettings, getDiscordSettings, sendDiscordNotificationWithRetry, getStoreEmailSettings, replaceTemplateVariables } from '../_shared/organization-settings.ts'

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
  result: 'confirmed' | 'extended' | 'cancelled' | 'already_extended'
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

    // RPC関数を実行（RETURNS TABLEは配列を返すため[0]で取得）
    if (check_type === 'day_before') {
      const { data, error } = await serviceClient.rpc('check_performances_day_before')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      result = {
        events_checked: row?.events_checked ?? 0,
        events_confirmed: row?.events_confirmed ?? 0,
        events_extended: row?.events_extended ?? 0,
        events_cancelled: row?.events_cancelled ?? 0,
        details: row?.details ?? []
      }
    } else if (check_type === 'four_hours_before') {
      const { data, error } = await serviceClient.rpc('check_performances_four_hours_before')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      result = {
        events_checked: row?.events_checked ?? 0,
        events_confirmed: row?.events_confirmed ?? 0,
        events_cancelled: row?.events_cancelled ?? 0,
        details: row?.details ?? []
      }
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
        // RPC関数で既に is_recruitment_extended = true に更新済み
        // 延長通知を送信（メール + Discord）
        notifications.push(
          sendExtensionNotification(serviceClient, event)
        )
      }
    }

    await Promise.allSettled(notifications)

    // 業務連絡チャンネルにサマリー通知を送信
    await sendBusinessSummaryNotification(serviceClient, check_type, result)

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

  // 1. 予約者一覧を取得（全ての基本変数に必要な情報を取得）
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count, reservation_number, total_price, title')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)
  
  // 2.5. カスタムテンプレートを取得
  const storeEmailSettings = await getStoreEmailSettings(supabase, {
    organizationId: event.organization_id
  })
  const customTemplate = storeEmailSettings?.performance_cancellation_template
  
  // 2.6. スタッフテーブルを取得（メールアドレスがない予約者のフォールバック用）
  const { data: staffList } = await supabase
    .from('staff')
    .select('name, display_name, email')
    .eq('organization_id', event.organization_id)
  
  // 3. 各予約者にメール送信
  if (reservations && reservations.length > 0 && emailSettings.resendApiKey) {
    for (const reservation of reservations) {
      // メールアドレスを取得（customer_email → スタッフテーブルからの検索）
      let emailToSend = reservation.customer_email
      if (!emailToSend && reservation.customer_name && staffList) {
        const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
        const matchedStaff = staffList.find(s => 
          s.name === normalizedName || s.display_name === normalizedName
        )
        if (matchedStaff?.email) {
          emailToSend = matchedStaff.email
          console.log('📧 スタッフテーブルからメール取得:', normalizedName)
        }
      }
      
      if (!emailToSend) continue

      try {
        await sendCancellationEmail(
          emailSettings,
          emailToSend,
          reservation.customer_name || 'お客様',
          event,
          customTemplate,
          {
            reservationNumber: reservation.reservation_number,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price,
            companyPhone: storeEmailSettings?.company_phone || '',
            companyEmail: storeEmailSettings?.company_email || ''
          }
        )
        console.log('✅ 中止メール送信:', maskEmail(emailToSend))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(emailToSend), emailError)
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

  // 4. Discord個別通知は廃止（サマリー通知に統一）
  // 以前: await sendDiscordCancellationNotification(supabase, event, checkType, reservations?.length || 0)

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
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  // テンプレート変数（基本変数セット - 全メール共通）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    
    // キャンセル関連
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    cancellation_reason: '人数未達のため中止となりました',
    
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || ''
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = (template: string): string => {
    const htmlContent = template
      .split('\n')
      .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
      .join('\n')
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
  }

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_cancellation_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
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

    finalText = `
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
  }

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
      html: finalHtml,
      text: finalText,
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
 * 募集延長通知を送信（メール + Discord）
 */
async function sendExtensionNotification(
  supabase: ReturnType<typeof createClient>,
  event: EventDetail
): Promise<void> {
  console.log('📧 募集延長通知送信開始:', event.event_id)

  // 1. 予約者一覧を取得
  const { data: reservations, error: resError } = await supabase
    .from('reservations')
    .select('id, customer_name, customer_email, participant_count, reservation_number, total_price')
    .eq('schedule_event_id', event.event_id)
    .in('status', ['pending', 'confirmed', 'gm_confirmed'])

  if (resError) {
    console.error('予約取得エラー:', resError)
  }

  // 2. メール設定を取得
  const emailSettings = await getEmailSettings(supabase, event.organization_id)
  
  // 2.5. カスタムテンプレートを取得
  const storeEmailSettings = await getStoreEmailSettings(supabase, {
    organizationId: event.organization_id
  })
  const customTemplate = storeEmailSettings?.performance_extension_template

  // 2.6. スタッフテーブルを取得（メールアドレスがない予約者のフォールバック用）
  const { data: staffList } = await supabase
    .from('staff')
    .select('name, display_name, email')
    .eq('organization_id', event.organization_id)

  // 3. 各予約者にメール送信
  if (reservations && reservations.length > 0 && emailSettings.resendApiKey) {
    for (const reservation of reservations) {
      // メールアドレスを取得（customer_email → スタッフテーブルからの検索）
      let emailToSend = reservation.customer_email
      if (!emailToSend && reservation.customer_name && staffList) {
        const normalizedName = reservation.customer_name.replace(/様$/, '').trim()
        const matchedStaff = staffList.find(s => 
          s.name === normalizedName || s.display_name === normalizedName
        )
        if (matchedStaff?.email) {
          emailToSend = matchedStaff.email
          console.log('📧 スタッフテーブルからメール取得:', normalizedName)
        }
      }
      
      if (!emailToSend) continue

      try {
        await sendExtensionEmail(
          emailSettings,
          emailToSend,
          reservation.customer_name || 'お客様',
          event,
          customTemplate,
          {
            reservationNumber: reservation.reservation_number,
            participantCount: reservation.participant_count,
            totalPrice: reservation.total_price,
            companyPhone: storeEmailSettings?.company_phone || '',
            companyEmail: storeEmailSettings?.company_email || ''
          }
        )
        console.log('✅ 延長通知メール送信:', maskEmail(emailToSend))
      } catch (emailError) {
        console.error('❌ メール送信エラー:', maskEmail(emailToSend), emailError)
      }
    }
  }

  // 4. Discord個別通知は廃止（サマリー通知に統一）
  console.log('✅ 募集延長処理完了（Discord通知はサマリーで送信）')
}

/**
 * 募集延長メールを送信
 */
async function sendExtensionEmail(
  emailSettings: Awaited<ReturnType<typeof getEmailSettings>>,
  customerEmail: string,
  customerName: string,
  event: EventDetail,
  customTemplate?: string | null,
  reservationDetails?: {
    reservationNumber?: string
    participantCount?: number
    totalPrice?: number
    companyPhone?: string
    companyEmail?: string
  }
): Promise<void> {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const formatTime = (timeStr: string): string => {
    return timeStr.slice(0, 5)
  }

  const remainingSeats = event.max_participants - event.current_participants

  // テンプレート変数（基本変数セット対応）
  const templateVariables: Record<string, string> = {
    // 顧客情報
    customer_name: customerName,
    customer_email: customerEmail,
    // 予約情報
    reservation_number: reservationDetails?.reservationNumber || '',
    scenario_title: event.scenario || '',
    date: formatDate(event.date),
    time: formatTime(event.start_time),
    end_time: event.end_time ? formatTime(event.end_time) : '',
    venue: event.store_name || '未定',
    participants: String(reservationDetails?.participantCount || event.current_participants),
    participant_count: String(reservationDetails?.participantCount || event.current_participants),
    total_price: reservationDetails?.totalPrice?.toLocaleString() || '',
    // キャンセル関連（延長時は空）
    cancellation_fee: '',
    cancellation_reason: '',
    // 会社情報
    company_name: emailSettings.senderName,
    company_phone: reservationDetails?.companyPhone || '',
    company_email: reservationDetails?.companyEmail || '',
    // 延長専用変数
    current_participants: String(event.current_participants),
    max_participants: String(event.max_participants),
    remaining_seats: String(remainingSeats),
    extension_deadline: '公演4時間前'
  }

  // カスタムテンプレートをHTMLに変換
  const templateToHtml = (template: string): string => {
    const htmlContent = template
      .split('\n')
      .map(line => `<p style="margin: 0.5em 0;">${line || '&nbsp;'}</p>`)
      .join('\n')
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
  <div style="padding: 20px 30px;">
    ${htmlContent}
  </div>
</body>
</html>`
  }

  let finalHtml: string
  let finalText: string

  if (customTemplate && customTemplate.trim()) {
    // カスタムテンプレートを使用
    const appliedTemplate = replaceTemplateVariables(customTemplate, templateVariables)
    finalHtml = templateToHtml(appliedTemplate)
    finalText = appliedTemplate
    console.log('📧 Using custom performance_extension_template')
  } else {
    // デフォルトテンプレート
    finalHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>募集延長のお知らせ</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fef3c7; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #b45309; margin-top: 0; font-size: 24px;">
      ⏰ 募集延長のお知らせ
    </h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${customerName} 様
    </p>
    <p style="font-size: 14px; color: #92400e;">
      ご予約いただいている公演は、現在定員に達していないため、募集を公演4時間前まで延長いたします。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">
      公演情報
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
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${event.store_name || '未定'}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">現在の参加者</td>
        <td style="padding: 12px 0; color: #1f2937;">${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #1e40af; font-size: 14px;">
      <strong>ご案内</strong><br>
      公演4時間前までに定員に達した場合は、公演を開催いたします。<br>
      定員に達しない場合は、中止となりメールでお知らせいたします。
    </p>
  </div>

  <div style="background-color: #dcfce7; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; color: #166534; font-size: 14px;">
      <strong>キャンセルについて</strong><br>
      募集延長中の公演は、キャンセル料無料でキャンセルが可能です。<br>
      ご都合が悪くなった場合は、お気軽にご連絡ください。
    </p>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。<br>
      ご協力よろしくお願いいたします。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">${emailSettings.senderName}</p>
    <p style="margin: 5px 0;">このメールは自動送信されています</p>
  </div>
</body>
</html>
    `

    finalText = `
${customerName} 様

⏰ 募集延長のお知らせ

ご予約いただいている公演は、現在定員に達していないため、募集を公演4時間前まで延長いたします。

━━━━━━━━━━━━━━━━━━━━
公演情報
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${event.scenario}
日時: ${formatDate(event.date)} ${formatTime(event.start_time)}〜
会場: ${event.store_name || '未定'}
現在の参加者: ${event.current_participants}/${event.max_participants}名（あと${remainingSeats}名）

━━━━━━━━━━━━━━━━━━━━

【ご案内】
公演4時間前までに定員に達した場合は、公演を開催いたします。
定員に達しない場合は、中止となりメールでお知らせいたします。

【キャンセルについて】
募集延長中の公演は、キャンセル料無料でキャンセルが可能です。
ご都合が悪くなった場合は、お気軽にご連絡ください。

お知り合いでご興味のある方がいらっしゃいましたら、ぜひお誘いください。
ご協力よろしくお願いいたします。

${emailSettings.senderName}
    `
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${emailSettings.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${emailSettings.senderName} <${emailSettings.senderEmail}>`,
      to: [customerEmail],
      subject: `【募集延長】${event.scenario} - ${event.date}`,
      html: finalHtml,
      text: finalText,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`Resend API error: ${JSON.stringify(errorData)}`)
  }
}

/**
 * 業務連絡チャンネルにサマリー通知を送信
 */
async function sendBusinessSummaryNotification(
  supabase: ReturnType<typeof createClient>,
  checkType: string,
  result: {
    events_checked: number
    events_confirmed: number
    events_extended?: number
    events_cancelled: number
    details: EventDetail[]
  }
): Promise<void> {
  // 対象イベントがない場合でも通知（確認のため）
  console.log('📢 業務連絡チャンネルへのサマリー通知開始')

  // 全組織の設定を取得（業務チャンネルIDがあるもの）
  const { data: orgSettings, error: orgError } = await supabase
    .from('organization_settings')
    .select('organization_id, discord_webhook_url, discord_business_channel_id')
    .not('discord_business_channel_id', 'is', null)

  if (orgError || !orgSettings || orgSettings.length === 0) {
    console.log('業務連絡チャンネル未設定、サマリー通知スキップ')
    return
  }

  const checkTypeLabel = checkType === 'day_before' ? '前日判定（23:59）' : '4時間前判定'
  const now = new Date()
  const jstDate = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  const jstTime = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
  
  // 対象日を計算（PostgreSQLのCURRENT_DATEと同じUTCベース）
  // RPCは CURRENT_DATE + INTERVAL '1 day' を使用するため、UTCベースで計算
  // 2026-03-10 修正: UTC日付を正しく計算
  const getTargetDateUTC = (checkTypeArg: string): string => {
    const currentTime = new Date()
    const y = currentTime.getUTCFullYear()
    const m = currentTime.getUTCMonth()
    const d = currentTime.getUTCDate()
    
    console.log(`🕐 UTC計算: year=${y}, month=${m}, date=${d}, checkType=${checkTypeArg}`)
    
    if (checkTypeArg === 'day_before') {
      // CURRENT_DATE + 1 day (UTC)
      const targetDate = new Date(Date.UTC(y, m, d + 1))
      const result = targetDate.toISOString().split('T')[0]
      console.log(`📅 day_before計算結果: ${result}`)
      return result
    } else {
      // CURRENT_DATE (UTC) - 4時間前判定は当日
      const targetDate = new Date(Date.UTC(y, m, d))
      const result = targetDate.toISOString().split('T')[0]
      console.log(`📅 four_hours_before計算結果: ${result}`)
      return result
    }
  }
  
  let targetDateForQuery: string
  if (result.details.length > 0 && result.details[0].date) {
    // 処理されたイベントがあればその日付を使用
    targetDateForQuery = result.details[0].date
  } else {
    // RPCと同じ日付を計算（UTCベース）
    targetDateForQuery = getTargetDateUTC(checkType)
  }
  
  console.log(`📅 クエリ対象日: ${targetDateForQuery} (checkType: ${checkType})`)

  // 既に延長済みのイベントを取得（今回の処理対象外だが通知には含める）
  // 公演開始時刻を過ぎたイベントは除外
  const processedEventIds = result.details.map(e => e.event_id)
  const now = new Date()
  const nowTimeStr = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  console.log(`🕐 現在時刻(JST): ${nowTimeStr}`)
  
  const { data: alreadyExtendedEvents } = await supabase
    .from('schedule_events')
    .select(`
      id,
      date,
      start_time,
      scenario,
      current_participants,
      max_participants,
      organization_id,
      gms,
      store_id,
      stores!inner(name)
    `)
    .eq('date', targetDateForQuery)
    .eq('is_recruitment_extended', true)
    .eq('is_cancelled', false)
    .eq('category', 'open')
    .gt('start_time', nowTimeStr)

  // 今回処理されたイベントを除外した、既に延長済みのイベント
  const alreadyExtendedDetails: EventDetail[] = (alreadyExtendedEvents || [])
    .filter(e => !processedEventIds.includes(e.id))
    .map(e => ({
      event_id: e.id,
      date: e.date,
      start_time: e.start_time,
      scenario: e.scenario,
      store_name: (e.stores as { name: string })?.name || '',
      current_participants: e.current_participants || 0,
      max_participants: e.max_participants || 8,
      result: 'already_extended' as const,
      organization_id: e.organization_id,
      gms: e.gms || []
    })) as EventDetail[]

  console.log(`📊 既に延長済みのイベント: ${alreadyExtendedDetails.length}件`)

  // 対象日の表示文字列を計算（処理イベント→延長済みイベント→フォールバックの順で取得）
  let targetDateStr: string
  if (result.details.length > 0 && result.details[0].date) {
    const eventDate = new Date(result.details[0].date + 'T00:00:00+09:00')
    targetDateStr = eventDate.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  } else if (alreadyExtendedDetails.length > 0 && alreadyExtendedDetails[0].date) {
    const eventDate = new Date(alreadyExtendedDetails[0].date + 'T00:00:00+09:00')
    targetDateStr = eventDate.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  } else {
    // フォールバック：クエリ用日付を使用
    const eventDate = new Date(targetDateForQuery + 'T00:00:00+09:00')
    targetDateStr = eventDate.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  }
  
  console.log(`📅 対象日: ${targetDateStr} (query: ${targetDateForQuery})`)

  // 各組織の業務連絡チャンネルに通知
  for (const org of orgSettings) {
    // 業務チャンネルIDがない場合はスキップ
    if (!org.discord_business_channel_id) continue

    try {
      // Bot APIを使用してチャンネルにメッセージを送信
      const discordSettings = await getDiscordSettings(supabase, org.organization_id)
      
      // 今回処理したイベント + 既に延長済みイベントを結合
      const allEvents = [...result.details, ...alreadyExtendedDetails]
      
      // GMのDiscord IDを取得してメンション用マップを作成
      const allGMs = allEvents.flatMap(e => e.gms || [])
      const uniqueGMs = [...new Set(allGMs)]
      let gmMentionMap: Record<string, string> = {}
      
      if (uniqueGMs.length > 0) {
        const { data: staffList } = await supabase
          .from('staff')
          .select('name, discord_user_id')
          .in('name', uniqueGMs)
          .eq('organization_id', org.organization_id)
        
        if (staffList) {
          for (const staff of staffList) {
            if (staff.discord_user_id) {
              gmMentionMap[staff.name] = `<@${staff.discord_user_id}>`
            }
          }
        }
      }
      
      // GM情報をメンション付きでフォーマット
      const formatGMsWithMention = (gms: string[] | undefined): string => {
        if (!gms || gms.length === 0) return ''
        const mentions = gms.map(gm => gmMentionMap[gm] || gm)
        return mentions.join(', ')
      }
      
      // 結果のラベルを取得
      const getResultLabel = (r: string): string => {
        if (r === 'cancelled') return '【中止】'
        if (r === 'extended') return '【募集延長】'
        if (r === 'already_extended') return '【延長中】'
        if (r === 'confirmed') return '【開催決定】'
        return '【不明】'
      }
      
      // プレーンテキストメッセージを構築
      const lines: string[] = []
      
      // ヘッダー
      lines.push(`📋 **${targetDateStr} 公演中止判定結果** (${checkTypeLabel})`)
      lines.push('')
      
      // サマリー（既に延長中のものも含める）
      const alreadyExtendedCount = alreadyExtendedDetails.length
      let summaryParts = [
        `チェック対象: ${result.events_checked}件`,
        `開催決定: ${result.events_confirmed}件`,
        `募集延長: ${result.events_extended ?? 0}件`
      ]
      if (alreadyExtendedCount > 0) {
        summaryParts.push(`延長中: ${alreadyExtendedCount}件`)
      }
      summaryParts.push(`中止: ${result.events_cancelled}件`)
      lines.push(summaryParts.join(' | '))
      lines.push('')
      
      if (allEvents.length === 0) {
        lines.push('対象となるオープン公演はありませんでした。')
      } else {
        // 公演を時間順にソート
        const sortedEvents = [...allEvents].sort((a, b) => {
          const timeA = a.start_time || '00:00'
          const timeB = b.start_time || '00:00'
          return timeA.localeCompare(timeB)
        })
        
        // 各公演を表示
        for (const event of sortedEvents) {
          const label = getResultLabel(event.result)
          const time = event.start_time?.slice(0, 5) || '??:??'
          const scenario = event.scenario || '未設定'
          const participants = `${event.current_participants}/${event.max_participants}名`
          const gms = formatGMsWithMention(event.gms)
          const store = event.store_name || ''
          
          let line = `${label} ${time} **${scenario}** (${participants})`
          if (store) line += ` @${store}`
          if (gms) line += ` GM: ${gms}`
          
          lines.push(line)
        }
      }
      
      lines.push('')
      lines.push(`_実行時刻: ${jstDate} ${jstTime}_`)
      
      const messageContent = lines.join('\n')
      
      // プレーンテキストメッセージを送信
      const plainMessage = { 
        content: messageContent,
        username: 'MMQ 公演判定システム'
      }
      
      console.log(`🔍 Discord設定: botToken=${discordSettings.botToken ? '✅設定あり' : '❌なし'}, businessChannelId=${org.discord_business_channel_id}, webhookUrl=${org.discord_webhook_url ? '✅設定あり' : '❌なし'}`)
      
      if (discordSettings.botToken) {
        // Discord Bot APIでチャンネルにメッセージ送信（MMQとして送信）
        const response = await fetch(`https://discord.com/api/v10/channels/${org.discord_business_channel_id}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${discordSettings.botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plainMessage)
        })

        if (response.ok) {
          console.log(`✅ 業務連絡通知送信完了: org=${org.organization_id}`)
        } else {
          const errorText = await response.text()
          console.error(`❌ 業務連絡通知失敗: org=${org.organization_id}`, response.status, errorText)
        }
      } else if (org.discord_webhook_url) {
        // Webhookを使用（フォールバック） - ⚠️ Botトークンがないため貸切予約botから送信される
        console.log(`⚠️ Botトークンが未設定のためWebhookにフォールバック: org=${org.organization_id}`)
        const success = await sendDiscordNotificationWithRetry(
          supabase,
          org.discord_webhook_url,
          plainMessage,
          org.organization_id,
          'performance_check_summary',
          undefined
        )
        
        if (success) {
          console.log(`✅ 業務連絡通知送信完了（Webhook）: org=${org.organization_id}`)
        } else {
          console.log(`⚠️ 業務連絡通知失敗、リトライキューに追加: org=${org.organization_id}`)
        }
      }
    } catch (error) {
      console.error(`❌ 業務連絡通知エラー: org=${org.organization_id}`, error)
    }
  }
}

