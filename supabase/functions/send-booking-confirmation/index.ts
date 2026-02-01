// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, maskName, verifyAuth, errorResponse, sanitizeErrorMessage } from '../_shared/security.ts'

interface BookingConfirmationRequest {
  reservationId: string
  organizationId?: string  // マルチテナント対応
  customerEmail: string
  customerName: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  storeAddress?: string
  participantCount: number
  totalPrice: number
  reservationNumber: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await verifyAuth(req)
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getAnonKey(),
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // リクエストボディを取得
    const bookingData: BookingConfirmationRequest = await req.json()

    // 予約の正当性を検証
    const { data: reservation, error: reservationError } = await supabaseClient
      .from('reservations')
      .select('id, customer_email, organization_id')
      .eq('id', bookingData.reservationId)
      .single()

    if (reservationError || !reservation) {
      return errorResponse('予約が見つかりません', 404, corsHeaders)
    }

    if (!reservation.customer_email || reservation.customer_email !== bookingData.customerEmail) {
      return errorResponse('メールアドレスが一致しません', 403, corsHeaders)
    }

    if (bookingData.organizationId && reservation.organization_id && bookingData.organizationId !== reservation.organization_id) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }

    // ログにはマスキングした情報のみ出力
    console.log('📧 Sending booking confirmation:', {
      reservationId: bookingData.reservationId,
      reservationNumber: bookingData.reservationNumber,
      customerEmail: maskEmail(bookingData.customerEmail),
      customerName: maskName(bookingData.customerName),
      scenarioTitle: bookingData.scenarioTitle,
      eventDate: bookingData.eventDate,
    })

    // 組織設定からメール設定を取得
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )
    
    let resendApiKey = Deno.env.get('RESEND_API_KEY')
    let senderEmail = 'noreply@example.com'
    let senderName = 'MMQ予約システム'
    
    const resolvedOrganizationId = bookingData.organizationId || reservation.organization_id
    if (resolvedOrganizationId) {
      const emailSettings = await getEmailSettings(serviceClient, resolvedOrganizationId)
      if (emailSettings.resendApiKey) {
        resendApiKey = emailSettings.resendApiKey
        senderEmail = emailSettings.senderEmail
        senderName = emailSettings.senderName
        console.log('✅ Using organization-specific email settings')
      }
    }
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      throw new Error('メール送信サービスが設定されていません')
    }

    // -------------------------------------------------------------------------
    // 冪等性: booking_email_queue に「1予約×1メール種別」で記録し、二重送信を防ぐ
    // -------------------------------------------------------------------------
    const emailType = 'booking_confirmation'
    if (resolvedOrganizationId) {
      try {
        const { data: existingQueue } = await serviceClient
          .from('booking_email_queue')
          .select('id, status, retry_count, max_retries')
          .eq('reservation_id', bookingData.reservationId)
          .eq('email_type', emailType)
          .maybeSingle()

        // 既に完了なら二重送信しない
        if (existingQueue?.status === 'completed') {
          console.log('📭 Already sent (idempotent):', bookingData.reservationNumber)
          return new Response(
            JSON.stringify({ success: true, message: '既に送信済みです' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          )
        }

        // 無ければ作成（UNIQUE: reservation_id + email_type）
        if (!existingQueue?.id) {
          await serviceClient
            .from('booking_email_queue')
            .upsert(
              {
                reservation_id: bookingData.reservationId,
                organization_id: resolvedOrganizationId,
                email_type: emailType,
                customer_email: bookingData.customerEmail,
                customer_name: bookingData.customerName,
                scenario_title: bookingData.scenarioTitle,
                event_date: bookingData.eventDate,
                start_time: bookingData.startTime,
                end_time: bookingData.endTime,
                store_name: bookingData.storeName,
                store_address: bookingData.storeAddress ?? null,
                participant_count: bookingData.participantCount,
                total_price: bookingData.totalPrice,
                reservation_number: bookingData.reservationNumber,
                status: 'processing',
                retry_count: 0,
                max_retries: 3,
                updated_at: new Date().toISOString()
              },
              { onConflict: 'reservation_id,email_type' }
            )
        } else {
          // 既存がある場合は processing に（送信中）
          await serviceClient
            .from('booking_email_queue')
            .update({
              status: 'processing',
              retry_count: (existingQueue.retry_count ?? 0) + 1,
              last_retry_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', existingQueue.id)
        }
      } catch (queueError) {
        console.warn('⚠️ booking_email_queue 記録に失敗（送信は継続）:', queueError)
      }
    }

    // 日付フォーマット関数
    const formatDate = (dateStr: string): string => {
      const date = new Date(dateStr)
      const weekdays = ['日', '月', '火', '水', '木', '金', '土']
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`
    }

    const formatTime = (timeStr: string): string => {
      return timeStr.slice(0, 5)
    }

    // メール本文を作成
    const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>予約確認</title>
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0; font-size: 24px;">ご予約ありがとうございます</h1>
    <p style="font-size: 16px; margin-bottom: 10px;">
      ${bookingData.customerName} 様
    </p>
    <p style="font-size: 14px; color: #666;">
      マーダーミステリーの予約が完了いたしました。以下の内容をご確認ください。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 18px; margin-top: 0; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">予約内容</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 30%;">予約番号</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.reservationNumber}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">シナリオ</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日時</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${formatDate(bookingData.eventDate)}<br>
          ${formatTime(bookingData.startTime)} - ${formatTime(bookingData.endTime)}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">
          ${bookingData.storeName}
          ${bookingData.storeAddress ? `<br><span style="font-size: 13px; color: #6b7280;">${bookingData.storeAddress}</span>` : ''}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${bookingData.participantCount}名</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; font-weight: bold; color: #6b7280;">お支払い金額</td>
        <td style="padding: 12px 0; color: #2563eb; font-size: 18px; font-weight: bold;">¥${bookingData.totalPrice.toLocaleString()}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <h3 style="color: #92400e; margin-top: 0; font-size: 16px;">重要事項</h3>
    <ul style="margin: 0; padding-left: 20px; color: #92400e;">
      <li style="margin-bottom: 8px;">当日は開始時刻の<strong>15分前</strong>までにご来場ください</li>
      <li style="margin-bottom: 8px;">お支払いは<strong>現地決済</strong>となります（現金・カード可）</li>
      <li style="margin-bottom: 8px;">キャンセルは公演開始の<strong>24時間前</strong>まで無料です</li>
      <li style="margin-bottom: 8px;">遅刻された場合、ご入場いただけない可能性があります</li>
    </ul>
  </div>

  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
    <p style="margin: 0; color: #666; font-size: 14px;">
      ご不明な点がございましたら、お気軽にお問い合わせください。<br>
      当日のご来店を心よりお待ちしております。
    </p>
  </div>

  <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">Murder Mystery Queue (MMQ)</p>
    <p style="margin: 5px 0;">このメールは予約完了時に自動送信されています</p>
  </div>
</body>
</html>
    `

    const emailText = `
${bookingData.customerName} 様

マーダーミステリーの予約が完了いたしました。

━━━━━━━━━━━━━━━━━━━━
予約内容
━━━━━━━━━━━━━━━━━━━━

予約番号: ${bookingData.reservationNumber}
シナリオ: ${bookingData.scenarioTitle}
日時: ${formatDate(bookingData.eventDate)} ${formatTime(bookingData.startTime)} - ${formatTime(bookingData.endTime)}
会場: ${bookingData.storeName}${bookingData.storeAddress ? '\n' + bookingData.storeAddress : ''}
参加人数: ${bookingData.participantCount}名
お支払い金額: ¥${bookingData.totalPrice.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━
重要事項
━━━━━━━━━━━━━━━━━━━━

• 当日は開始時刻の15分前までにご来場ください
• お支払いは現地決済となります（現金・カード可）
• キャンセルは公演開始の24時間前まで無料です
• 遅刻された場合、ご入場いただけない可能性があります

━━━━━━━━━━━━━━━━━━━━

ご不明な点がございましたら、お気軽にお問い合わせください。
当日のご来店を心よりお待ちしております。

Murder Mystery Queue (MMQ)
このメールは予約完了時に自動送信されています
    `

    // Resend APIを使ってメール送信
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [bookingData.customerEmail],
        subject: `【予約完了】${bookingData.scenarioTitle} - ${formatDate(bookingData.eventDate)}`,
        html: emailHtml,
        text: emailText,
      }),
    })

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json()
      console.error('Resend API error:', errorData)
      // キューがあれば pending に戻してリトライできるようにする
      if (resolvedOrganizationId) {
        try {
          await serviceClient
            .from('booking_email_queue')
            .update({
              status: 'pending',
              last_error: JSON.stringify(errorData),
              updated_at: new Date().toISOString()
            })
            .eq('reservation_id', bookingData.reservationId)
            .eq('email_type', emailType)
        } catch (_e) {
          // noop
        }
      }
      throw new Error(`メール送信に失敗しました: ${JSON.stringify(errorData)}`)
    }

    const result = await resendResponse.json()
    console.log('✅ Email sent successfully to:', maskEmail(bookingData.customerEmail))

    // キューを completed に更新（以後の二重送信を防ぐ）
    if (resolvedOrganizationId) {
      try {
        await serviceClient
          .from('booking_email_queue')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('reservation_id', bookingData.reservationId)
          .eq('email_type', emailType)
      } catch (_e) {
        // noop
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'メールを送信しました',
        emailId: result.id 
      }),
      { headers: corsHeaders, status: 200 }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Error:', sanitizeErrorMessage(errorMessage))
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizeErrorMessage(errorMessage || 'メール送信に失敗しました') 
      }),
      { headers: corsHeaders, status: 400 }
    )
  }
})
