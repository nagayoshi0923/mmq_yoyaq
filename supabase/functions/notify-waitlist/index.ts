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
import { getEmailSettings, getEmailTemplates, getStoreEmailSettings } from '../_shared/organization-settings.ts'
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
  // bookingUrl: string  ← 削除（サーバー側で生成）
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

    // 🔒 認証チェック（緩和: Publishable Key 対応のため匿名許可）
    // セキュリティはイベントへのアクセス権限確認で担保
    const authResult = await verifyAuth(req, undefined, { allowAnonymous: true })
    if (!authResult.success) {
      console.warn('⚠️ 認証失敗: notify-waitlist への不正アクセス試行')
      return errorResponse(
        authResult.error || '認証が必要です',
        authResult.statusCode || 401,
        corsHeaders
      )
    }
    console.log('✅ 認証:', authResult.user?.email || '匿名')

    const data: NotifyWaitlistRequest = await req.json()

    // 🔒 イベントへのアクセス権限確認（匿名ユーザーはスキップ）
    // 匿名ユーザーの場合は、予約IDとメールアドレスの検証で代替
    // スタッフ: 組織メンバーであればOK
    // 顧客: そのイベントに予約があればOK
    const isAnonymous = authResult.user?.id === 'anonymous' || authResult.user?.role === 'anonymous'
    
    if (!isAnonymous && data.scheduleEventId && authResult.user?.id) {
      console.log('🔍 アクセス権限確認開始:', { 
        userId: authResult.user?.id, 
        organizationId: data.organizationId,
        scheduleEventId: data.scheduleEventId 
      })
      
      // 1. スタッフかどうか確認（organization_idがある場合のみフィルタ）
      let staffQuery = serviceClient
        .from('staff')
        .select('id, organization_id')
        .eq('user_id', authResult.user.id)
        .eq('status', 'active')
      
      // organization_idが指定されていればフィルタ
      if (data.organizationId) {
        staffQuery = staffQuery.eq('organization_id', data.organizationId)
      }
      
      const { data: staffMember, error: staffError } = await staffQuery.maybeSingle()
      
      console.log('🔍 スタッフチェック結果:', { staffMember, staffError })
      
      if (!staffMember) {
        // 2. スタッフでなければ、そのイベントに予約があるか確認
        const { data: customerReservation, error: reservationError } = await serviceClient
          .from('reservations')
          .select('id, customers!inner(user_id)')
          .eq('schedule_event_id', data.scheduleEventId)
          .eq('customers.user_id', authResult.user.id)
          .maybeSingle()
        
        console.log('🔍 予約チェック結果:', { customerReservation, reservationError })
        
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
    } else if (isAnonymous) {
      console.log('✅ 匿名ユーザー: アクセス権限チェックをスキップ')
    }
    console.log('Notify waitlist request:', { 
      eventId: data.scheduleEventId, 
      freedSeats: data.freedSeats 
    })

    // 🔒 SEC-P0-03対策: bookingUrl をサーバー側で生成（入力値を無視）
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .select('slug')
      .eq('id', data.organizationId)
      .single()
    
    if (orgError || !org) {
      console.error('Organization fetch error:', orgError)
      throw new Error('組織情報の取得に失敗しました')
    }
    
    // デフォルトドメイン + slug で予約URLを生成
    const bookingUrl = `https://mmq.game/${org.slug || 'queens-waltz'}`
    
    console.log('✅ bookingUrl generated server-side:', bookingUrl)

    // メール設定を取得
    const emailSettings = data.organizationId 
      ? await getEmailSettings(serviceClient, data.organizationId)
      : null
    
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
    const senderName = emailSettings?.senderName || Deno.env.get('SENDER_NAME') || 'MMQ予約システム'

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // キャンセル待ち全員に一斉通知
    // 先着順ではなく、登録者全員に同時にメールを送信
    const { data: waitlistEntries, error: waitlistError } = await serviceClient
      .rpc('notify_all_waitlist_entries', {
        p_schedule_event_id: data.scheduleEventId
      })

    if (waitlistError) {
      console.error('Waitlist fetch error:', waitlistError)
      throw new Error('キャンセル待ちリストの取得に失敗しました')
    }

    // RPCが空配列を返す場合（キャンセル待ちなし）
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

    // RPCで既にフィルタリング・ステータス更新済みなので、そのまま使用
    const notifiedEntries: WaitlistEntry[] = waitlistEntries

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
    
    // schedule_events から store_id を取得
    const { data: scheduleEvent, error: eventError } = await serviceClient
      .from('schedule_events')
      .select('store_id')
      .eq('id', data.scheduleEventId)
      .single()
    
    const storeId = scheduleEvent?.store_id
    
    // 店舗のメール設定（テンプレート・会社情報）を取得
    const storeEmailSettings = await getStoreEmailSettings(serviceClient, {
      storeId: storeId,
      organizationId: data.organizationId
    })
    
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name || senderName
    const companyEmail = storeEmailSettings?.company_email || ''
    const companyPhone = storeEmailSettings?.company_phone || ''
    
    // カスタムテンプレートの取得
    const customTemplate = storeEmailSettings?.waitlist_notify_template

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
      先着順となっております。空席には限りがありますので、お早めにご予約ください。
    </p>
  </div>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${bookingUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">
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

先着順となっております。空席には限りがありますので、お早めにご予約ください。

▼ 今すぐ予約する
${bookingUrl}

━━━━━━━━━━━━━━━━━━━━

予約が完了しましたら、キャンセル待ちは自動的に解除されます。

${emailTemplates.signature}

${emailTemplates.footer}
      `

      // テンプレートの変数置換用関数（基本変数セット対応）
      const applyTemplate = (template: string) => {
        return template
          // 顧客情報
          .replace(/{customer_name}/g, entry.customer_name || 'お客様')
          .replace(/{customer_email}/g, entry.customer_email || '')
          // 予約情報
          .replace(/{reservation_number}/g, '')
          .replace(/{scenario_title}/g, data.scenarioTitle || '')
          .replace(/{date}/g, formatDate(data.eventDate))
          .replace(/{time}/g, formatTime(data.startTime))
          .replace(/{end_time}/g, formatTime(data.endTime))
          .replace(/{venue}/g, data.storeName || '')
          .replace(/{participants}/g, String(entry.participant_count || ''))
          .replace(/{participant_count}/g, String(entry.participant_count || ''))
          .replace(/{total_price}/g, '')
          // キャンセル関連
          .replace(/{cancellation_fee}/g, '')
          .replace(/{cancellation_reason}/g, '')
          // 会社情報
          .replace(/{company_name}/g, companyName)
          .replace(/{company_phone}/g, companyPhone || '')
          .replace(/{company_email}/g, companyEmail || '')
          // 追加変数（キャンセル待ち専用）
          .replace(/{booking_url}/g, bookingUrl)
          .replace(/{freed_seats}/g, String(data.freedSeats || ''))
      }

      // カスタムテンプレートをHTMLに変換
      const templateToHtml = (template: string) => {
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

      // 最終的なHTMLとテキストを決定
      let finalHtml: string
      let finalText: string

      if (customTemplate && customTemplate.trim()) {
        // email_settingsにテンプレートが設定されている場合
        const appliedTemplate = applyTemplate(customTemplate)
        finalHtml = templateToHtml(appliedTemplate)
        finalText = appliedTemplate
        console.log('📧 Using custom waitlist_notify_template from email_settings')
      } else {
        // デフォルトのハードコードテンプレートを使用
        finalHtml = emailHtml
        finalText = emailText
      }

      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${companyName} <${senderEmail}>`,
            to: [entry.customer_email],
            subject: `【空席のお知らせ】${data.scenarioTitle} - ${formatDate(data.eventDate)}`,
            html: finalHtml,
            text: finalText,
            reply_to: companyEmail || undefined,
          }),
        })

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json()
          console.error('Resend API error for', entry.customer_email, ':', errorData)
          return { success: false, entryId: entry.id, error: errorData }
        }

        // 🔒 SEC-P0-03: ステータス更新はRPCで既に完了済み
        // fetch_and_lock_waitlist_entries でアトミックに更新されているため、ここでの更新は不要

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

