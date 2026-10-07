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
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, checkRateLimit, getClientIP, rateLimitResponse, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'
import { insertEmailLog, updateEmailLog } from '../_shared/email-logs.ts'

interface NotifyWaitlistRequest {
  organizationId: string
  scheduleEventId: string
  freedSeats: number  // キャンセルで空いた席数
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
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
    if (req.method !== 'POST') return errorResponse('POSTが必要です', 405, corsHeaders)

    // ブラウザは有効なユーザーJWT、サーバーは既存の検証済みservice/cronキーのみ。
    // 匿名・無効認証をservice_roleで代理実行しない。
    const systemCall = isCronOrServiceRoleCall(req)
    const authResult = systemCall ? null : await verifyAuth(req)
    if (!systemCall && (!authResult?.success || !authResult.user?.id)) {
      return errorResponse('認証が必要です', 401, corsHeaders)
    }
    const data: NotifyWaitlistRequest = await req.json()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (typeof data.organizationId !== 'string' || typeof data.scheduleEventId !== 'string'
      || !uuid.test(data.organizationId) || !uuid.test(data.scheduleEventId)) {
      return errorResponse('組織・公演IDが必要です', 400, corsHeaders)
    }
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())
    const { data: authorizedEvent, error: authorizedEventError } = await serviceClient.from('schedule_events')
      .select('organization_id').eq('id', data.scheduleEventId).maybeSingle()
    if (authorizedEventError || !authorizedEvent || authorizedEvent.organization_id !== data.organizationId) {
      return errorResponse('対象公演へのアクセスが許可されていません', 403, corsHeaders)
    }
    if (!systemCall) {
      const userId = authResult!.user!.id
      const { data: staffMember, error: staffError } = await serviceClient.from('staff')
        .select('id').eq('user_id', userId).eq('status', 'active')
        .eq('organization_id', authorizedEvent.organization_id).limit(1).maybeSingle()
      if (staffError) return errorResponse('権限の確認に失敗しました', 500, corsHeaders)
      if (!staffMember) {
        // 取消後も本人予約の記録を照合する。予約状態による絞込みはしない。
        const { data: customerReservation, error: customerError } = await serviceClient.from('reservations')
          .select('id, customers!inner(user_id)').eq('schedule_event_id', data.scheduleEventId)
          .eq('organization_id', authorizedEvent.organization_id).eq('customers.user_id', userId)
          .limit(1).maybeSingle()
        if (customerError) return errorResponse('権限の確認に失敗しました', 500, corsHeaders)
        let hasAccess = Boolean(customerReservation)
        if (!hasAccess) {
          const { data: directReservation, error: directError } = await serviceClient.from('reservations')
            .select('id').eq('schedule_event_id', data.scheduleEventId)
            .eq('organization_id', authorizedEvent.organization_id).eq('created_by', userId)
            .limit(1).maybeSingle()
          if (directError) return errorResponse('権限の確認に失敗しました', 500, corsHeaders)
          hasAccess = Boolean(directReservation)
        }
        if (!hasAccess) return errorResponse('対象公演へのアクセスが許可されていません', 403, corsHeaders)
      }
    }
    // 拒否した呼び出しは待機列/通知だけでなくレート制限記録も更新しない。
    const rateLimit = await checkRateLimit(serviceClient, getClientIP(req), 'notify-waitlist', 30, 60)
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfter, corsHeaders)

    // 🔒 SEC-P0-03対策: bookingUrl をサーバー側で生成（入力値を無視）
    const { data: org, error: orgError } = await serviceClient
      .from('organizations')
      .select('slug')
      .eq('id', data.organizationId)
      .single()
    
    if (orgError || !org) {
      console.error('Organization fetch error:', orgError)
      // エラーでも処理を続行（通知スキップ）
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '組織情報が取得できませんでした（通知スキップ）',
          notifiedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
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
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'メール設定がありません（通知スキップ）',
          notifiedCount: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // キャンセル待ち全員に一斉通知
    // 先着順ではなく、登録者全員に同時にメールを送信
    const { data: waitlistEntries, error: waitlistError } = await serviceClient
      .rpc('notify_all_waitlist_entries', {
        p_schedule_event_id: data.scheduleEventId
      })

    if (waitlistError) {
      console.error('Waitlist fetch error:', waitlistError)
      return errorResponse('キャンセル待ち通知の準備に失敗しました', 500, corsHeaders)
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

    // 24時間後を回答期限として設定
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // 🎨 組織別メールテンプレートを取得
    const emailTemplates = await getEmailTemplates(serviceClient, data.organizationId)
    
    // schedule_events から store_id を取得
    const { data: scheduleEvent, error: eventError } = await serviceClient
      .from('schedule_events')
      .select('store_id')
      .eq('id', data.scheduleEventId)
      .maybeSingle()
    
    if (eventError) {
      console.warn('schedule_events取得エラー（続行）:', eventError)
    }
    
    const storeId = scheduleEvent?.store_id
    
    // 店舗のメール設定（テンプレート・会社情報）を取得
    const storeEmailSettings = await getStoreEmailSettings(serviceClient, {
      storeId: storeId,
      organizationId: data.organizationId,
      scheduleEventId: data.scheduleEventId
    })
    
    // 会社情報（デフォルト値付き）
    const companyName = storeEmailSettings?.company_name ?? senderName
    const companyEmail = storeEmailSettings?.company_email ?? ''
    const companyPhone = storeEmailSettings?.company_phone ?? ''
    
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
          .replace(/{venue_address}/g, data.storeAddress || '')
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
          // 未置換変数を除去
          .replace(/\{[a-z_]+\}/g, '')
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

      const waitlistEmailSubject = `【空席のお知らせ】${data.scenarioTitle} - ${formatDate(data.eventDate)}`
      const waitlistEmailLogId = await insertEmailLog(serviceClient, {
        organization_id:   data.organizationId ?? null,
        schedule_event_id: data.scheduleEventId ?? null,
        email_type:        'waitlist_confirmed',
        to_email:          entry.customer_email,
        to_name:           entry.customer_name ?? null,
        subject:           waitlistEmailSubject,
        body_html:         finalHtml,
        body_text:         finalText,
        status:            'queued',
      })

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
            subject: waitlistEmailSubject,
            html: finalHtml,
            text: finalText,
            reply_to: companyEmail || undefined,
          }),
        })

        if (!resendResponse.ok) {
          const errorData = await resendResponse.json()
          console.error('Resend API error for', entry.customer_email, ':', errorData)
          await updateEmailLog(serviceClient, waitlistEmailLogId, {
            status: 'failed',
            error_message: sanitizeErrorMessage(JSON.stringify(errorData)),
          })
          return { success: false, entryId: entry.id, error: errorData }
        }

        const waitlistEmailResult = await resendResponse.json()
        await updateEmailLog(serviceClient, waitlistEmailLogId, {
          status: 'sent',
          provider_message_id: waitlistEmailResult?.id ?? null,
          sent_at: new Date().toISOString(),
        })

        // 🔒 SEC-P0-03: ステータス更新はRPCで既に完了済み
        // fetch_and_lock_waitlist_entries でアトミックに更新されているため、ここでの更新は不要

        console.log('Email sent to:', entry.customer_email)
        return { success: true, entryId: entry.id }
      } catch (err) {
        console.error('Email send error for', entry.customer_email, ':', err)
        await updateEmailLog(serviceClient, waitlistEmailLogId, {
          status: 'failed',
          error_message: sanitizeErrorMessage(err?.message ?? String(err)),
        })
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
    // キャンセル待ち通知は補助機能なので、エラーでも200を返す
    // メイン処理（キャンセル・人数変更）には影響しないようにする
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'キャンセル待ち通知処理中にエラーが発生しました（スキップ）',
        notifiedCount: 0,
        // 内部ログ用（フロントエンドには表示しない）
        _debug: sanitizeErrorMessage(error, '')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})

