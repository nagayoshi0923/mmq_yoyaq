/**
 * キャンセル待ち通知 Edge Function
 * 
 * 予約キャンセル発生時に呼び出され、該当イベントのキャンセル待ちリストに
 * 登録されているユーザーに空席通知メールを送信する。
 * 
 * 通知は先着順（created_at順）で行い、空き人数分だけ通知する。
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings, getEmailTemplates } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, checkRateLimit, getClientIP, rateLimitResponse } from '../_shared/security.ts'

interface NotifyWaitlistRequest {
  organizationId: string
  scheduleEventId: string
  freedSeats: number  // キャンセルで空いた席数
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  bookingUrl: string  // 予約ページへのURL
}

interface WaitlistEntry {
  id: string
  customer_name: string
  customer_email: string
  participant_count: number
  status: string
  created_at: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 レートリミットチェック（1分あたり30リクエストまで）
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const clientIP = getClientIP(req)
    const rateLimit = await checkRateLimit(serviceClient, clientIP, 'notify-waitlist', 30, 60)
    
    if (!rateLimit.allowed) {
      console.warn('⚠️ レートリミット超過:', clientIP)
      return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
    }

    // 🔒 認証チェック: ログイン済みユーザーのみ呼び出し可能
    const authResult = await verifyAuth(req)
    if (!authResult.success) {
      console.warn('⚠️ 認証失敗: notify-waitlist への不正アクセス試行')
      return errorResponse(
        authResult.error || '認証が必要です',
        authResult.statusCode || 401,
        corsHeaders
      )
    }
    console.log('✅ 認証成功:', authResult.user?.email)

    const data: NotifyWaitlistRequest = await req.json()

    // 🔒 イベントへのアクセス権限確認
    // スタッフ: 組織メンバーであればOK
    // 顧客: そのイベントに予約があればOK
    if (data.scheduleEventId && authResult.user?.id) {
      // 1. スタッフかどうか確認
      const { data: staffMember } = await serviceClient
        .from('staff')
        .select('id')
        .eq('user_id', authResult.user.id)
        .eq('organization_id', data.organizationId)
        .eq('status', 'active')
        .maybeSingle()
      
      if (!staffMember) {
        // 2. スタッフでなければ、そのイベントに予約があるか確認
        const { data: customerReservation } = await serviceClient
          .from('reservations')
          .select('id, customers!inner(user_id)')
          .eq('schedule_event_id', data.scheduleEventId)
          .eq('customers.user_id', authResult.user.id)
          .maybeSingle()
        
        if (!customerReservation) {
          console.warn('⚠️ アクセス権限なし:', authResult.user?.email, '→ event:', data.scheduleEventId)
          return errorResponse(
            'このイベントへのアクセス権がありません',
            403,
            corsHeaders
          )
        }
      }
      console.log('✅ アクセス権限確認OK')
    }
    console.log('Notify waitlist request:', { 
      eventId: data.scheduleEventId, 
      freedSeats: data.freedSeats 
    })

    // メール設定を取得
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@mmq.game'
    let senderName = 'MMQ予約システム'

    if (data.organizationId) {
      const emailSettings = await getEmailSettings(serviceClient, data.organizationId)
      if (emailSettings.resendApiKey) {
        resendApiKey = emailSettings.resendApiKey
        senderEmail = emailSettings.senderEmail
        senderName = emailSettings.senderName
      }
    }

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // 該当イベントのキャンセル待ちを取得（waiting状態のもの、登録順）
    const { data: waitlistEntries, error: waitlistError } = await serviceClient
      .from('waitlist')
      .select('id, customer_name, customer_email, participant_count, status, created_at')
      .eq('schedule_event_id', data.scheduleEventId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })

    if (waitlistError) {
      console.error('Waitlist fetch error:', waitlistError)
      throw new Error('キャンセル待ちリストの取得に失敗しました')
    }

    if (!waitlistEntries || waitlistEntries.length === 0) {
      console.log('No waitlist entries found for this event')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'キャンセル待ちはありませんでした',
          notifiedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 空き席数分だけ通知（希望人数が多い順位より先着順を優先）
    let remainingSeats = data.freedSeats
    const notifiedEntries: WaitlistEntry[] = []

    for (const entry of waitlistEntries) {
      // 残り席数より希望人数が多い場合も通知（一部参加でも予約したい場合がある）
      if (remainingSeats > 0) {
        notifiedEntries.push(entry)
        remainingSeats -= entry.participant_count
      }
    }

    // 通知対象がいない場合
    if (notifiedEntries.length === 0) {
      console.log('No entries to notify')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '通知対象がありませんでした',
          notifiedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 日付フォーマット
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // 24時間後を回答期限として設定
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // 🎨 組織別メールテンプレートを取得
    const emailTemplates = await getEmailTemplates(serviceClient, data.organizationId)

    // 各エントリーにメール送信
    const emailPromises = notifiedEntries.map(async (entry) => {
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
      ${entry.customer_name} 様
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
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(data.eventDate)}<br>
          ${formatTime(data.startTime)} - ${formatTime(data.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.storeName}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">ご希望人数</td>
        <td style="padding: 12px 0; color: #1f2937;">${entry.participant_count}名</td>
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
    <a href="${data.bookingUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">
      今すぐ予約する
    </a>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      予約が完了しましたら、キャンセル待ちは自動的に解除されます。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0; white-space: pre-line;">${emailTemplates.signature}</p>
    <p style="margin: 10px 0; font-size: 11px;">${emailTemplates.footer}</p>
  </div>
</body>
</html>
      `

      const emailText = `
${entry.customer_name} 様

🎉 空席のお知らせ

キャンセル待ちにご登録いただいていた公演に空きが出ました！

━━━━━━━━━━━━━━━━━━━━
空きが出た公演
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${data.scenarioTitle}
日時: ${formatDate(data.eventDate)} ${formatTime(data.startTime)} - ${formatTime(data.endTime)}
会場: ${data.storeName}
ご希望人数: ${entry.participant_count}名

━━━━━━━━━━━━━━━━━━━━
⏰ お早めにご予約ください
━━━━━━━━━━━━━━━━━━━━

先着順となっております。
24時間以内にご予約いただけない場合、次の方に通知されます。

▼ 今すぐ予約する
${data.bookingUrl}

━━━━━━━━━━━━━━━━━━━━

予約が完了しましたら、キャンセル待ちは自動的に解除されます。

${emailTemplates.signature}

${emailTemplates.footer}
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
            to: [entry.customer_email],
            subject: `【空席のお知らせ】${data.scenarioTitle} - ${formatDate(data.eventDate)}`,
            html: emailHtml,
            text: emailText,
          }),
        })

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json()
          console.error('Resend API error for', entry.customer_email, ':', errorData)
          return { success: false, entryId: entry.id, error: errorData }
        }

        // ステータスを「notified」に更新し、期限を設定
        const { error: updateError } = await serviceClient
          .from('waitlist')
          .update({ 
            status: 'notified', 
            notified_at: new Date().toISOString(),
            expires_at: expiresAt
          })
          .eq('id', entry.id)

        if (updateError) {
          console.error('Waitlist update error:', updateError)
        }

        console.log('Email sent to:', entry.customer_email)
        return { success: true, entryId: entry.id }
      } catch (err) {
        console.error('Email send error for', entry.customer_email, ':', err)
        return { success: false, entryId: entry.id, error: err.message }
      }
    })

    const results = await Promise.all(emailPromises)
    const successCount = results.filter(r => r.success).length

    console.log(`Notified ${successCount}/${notifiedEntries.length} waitlist entries`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${successCount}件のキャンセル待ちに通知しました`,
        notifiedCount: successCount,
        totalWaitlist: notifiedEntries.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        // 🔒 セキュリティ: 技術的詳細をサニタイズ
        error: sanitizeErrorMessage(error, 'キャンセル待ち通知に失敗しました')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

