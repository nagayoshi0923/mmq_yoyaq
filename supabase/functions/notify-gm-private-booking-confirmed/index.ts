// @ts-nocheck
// GMへの貸切予約確定通知を送信
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings, getEmailSettings } from '../_shared/organization-settings.ts'
import { errorResponse, getCorsHeaders, getServiceRoleKey, verifyAuth } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface GMNotificationRequest {
  organizationId: string
  gmId: string
  gmName: string
  gmEmail?: string
  gmDiscordChannelId?: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  customerName: string
  participantCount: number
  reservationId: string
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 認証チェック
    const authResult = await verifyAuth(req)
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const data: GMNotificationRequest = await req.json()
    console.log('📤 GM確定通知リクエスト:', { gmName: data.gmName, scenarioTitle: data.scenarioTitle })

    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    const eventDateObj = new Date(data.eventDate + 'T00:00:00+09:00')
    const formattedDate = `${eventDateObj.getMonth() + 1}/${eventDateObj.getDate()}(${weekdays[eventDateObj.getDay()]})`
    const formattedTime = `${data.startTime.substring(0, 5)}〜${data.endTime.substring(0, 5)}`

    // Discord通知
    if (data.gmDiscordChannelId) {
      try {
        const discordSettings = await getDiscordSettings(supabase, data.organizationId)
        const botToken = discordSettings?.botToken || Deno.env.get('DISCORD_BOT_TOKEN')

        if (botToken) {
          const embed = {
            title: '🎉 貸切公演が確定しました',
            color: 0x10b981, // green
            fields: [
              { name: '📚 シナリオ', value: data.scenarioTitle, inline: false },
              { name: '📅 日程', value: `${formattedDate} ${formattedTime}`, inline: true },
              { name: '📍 会場', value: data.storeName, inline: true },
              { name: '👤 代表者', value: data.customerName, inline: true },
              { name: '👥 人数', value: `${data.participantCount}名`, inline: true },
            ],
            footer: { text: '貸切予約確定通知' },
            timestamp: new Date().toISOString()
          }

          const response = await fetch(`https://discord.com/api/v10/channels/${data.gmDiscordChannelId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ embeds: [embed] }),
          })

          if (response.ok) {
            console.log('✅ Discord通知送信成功:', data.gmDiscordChannelId)
          } else {
            const errorText = await response.text()
            console.error('❌ Discord通知送信失敗:', errorText)
          }
        }
      } catch (discordError) {
        console.error('Discord通知エラー:', discordError)
      }
    }

    // メール通知
    if (data.gmEmail) {
      try {
        const emailSettings = await getEmailSettings(supabase, data.organizationId)
        const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
        const senderEmail = emailSettings?.senderEmail || Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
        const senderName = emailSettings?.senderName || 'MMQ予約システム'

        if (resendApiKey) {
          const emailHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #dcfce7; border-radius: 8px; padding: 25px; margin-bottom: 20px; border: 2px solid #10b981;">
    <h1 style="color: #065f46; margin-top: 0; font-size: 22px;">🎉 貸切公演が確定しました</h1>
    <p style="font-size: 15px; margin-bottom: 5px;">
      ${data.gmName} さん
    </p>
    <p style="font-size: 14px; color: #065f46;">
      以下の貸切公演の担当GMとしてアサインされました。
    </p>
  </div>

  <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h2 style="color: #1f2937; font-size: 16px; margin-top: 0; border-bottom: 2px solid #10b981; padding-bottom: 8px;">公演詳細</h2>
    
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280; width: 25%;">シナリオ</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.scenarioTitle}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">日程</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${formattedDate} ${formattedTime}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">会場</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.storeName}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: bold; color: #6b7280;">代表者</td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #1f2937;">${data.customerName}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #6b7280;">参加人数</td>
        <td style="padding: 10px 0; color: #1f2937;">${data.participantCount}名</td>
      </tr>
    </table>
  </div>

  <div style="text-align: center; padding-top: 15px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px;">
    <p style="margin: 5px 0;">このメールは貸切予約確定時にGMへ自動送信されています</p>
  </div>
</body>
</html>
          `

          const emailText = `
${data.gmName} さん

貸切公演が確定しました。
以下の貸切公演の担当GMとしてアサインされました。

━━━━━━━━━━━━━━━━━━━━
公演詳細
━━━━━━━━━━━━━━━━━━━━

シナリオ: ${data.scenarioTitle}
日程: ${formattedDate} ${formattedTime}
会場: ${data.storeName}
代表者: ${data.customerName}
参加人数: ${data.participantCount}名

━━━━━━━━━━━━━━━━━━━━

このメールは貸切予約確定時にGMへ自動送信されています
          `

          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `${senderName} <${senderEmail}>`,
              to: [data.gmEmail],
              subject: `【GM担当確定】${data.scenarioTitle} - ${formattedDate}`,
              html: emailHtml,
              text: emailText,
            }),
          })

          if (response.ok) {
            console.log('✅ メール通知送信成功:', data.gmEmail)
          } else {
            const errorText = await response.text()
            console.error('❌ メール通知送信失敗:', errorText)
          }
        }
      } catch (emailError) {
        console.error('メール通知エラー:', emailError)
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'GM通知を送信しました' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
