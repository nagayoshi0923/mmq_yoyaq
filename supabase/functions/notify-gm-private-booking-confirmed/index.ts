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
  /** スタッフ個人のDiscordチャンネル（あれば最優先で投稿） */
  gmDiscordChannelId?: string
  /** DiscordユーザーID（スノーフレーク）。個人チャンネルが無い場合はDM、失敗時は貸切用チャンネルでメンション */
  gmDiscordUserId?: string
  scenarioTitle: string
  eventDate: string
  startTime: string
  endTime: string
  storeName: string
  customerName: string
  participantCount: number
  reservationId: string
}

/**
 * 貸切の「公演日」を JST の暦日 YYYY-MM-DD に正規化する。
 * - 素の YYYY-MM-DD は日本のカレンダー日としてそのまま採用（DBの date と同じ解釈）
 * - ISO タイムスタンプは Asia/Tokyo の暦日に変換（UTC日付とズレないようにする）
 */
function eventDateToYmdJstCalendar(eventDate: string): string {
  const s = (eventDate || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const day = parts.find((p) => p.type === 'day')?.value
    if (y && m && day) return `${y}-${m}-${day}`
  }
  const prefix = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return prefix ? prefix[1] : s.slice(0, 10)
}

/** YYYY-MM-DD（または正規化後）を JST の暦日・曜日で表示 */
function formatEventDateLineJst(eventDate: string): string {
  const ymd = eventDateToYmdJstCalendar(eventDate)
  const noonJst = new Date(`${ymd}T12:00:00+09:00`)
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'narrow',
  }).formatToParts(noonJst)
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? ''
  return `${month}/${day}(${wd})`
}

/**
 * 公演時刻を JST の HH:mm で表示。
 * HH:mm / HH:mm:ss はそのまま解釈、ISO文字列は Asia/Tokyo で時分を取る。
 */
function formatScheduleClockJst(timeStr: string): string {
  const s = (timeStr || '').trim()
  if (!s) return ''
  const hmMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (hmMatch) {
    const h = String(parseInt(hmMatch[1], 10)).padStart(2, '0')
    const m = hmMatch[2]
    return `${h}:${m}`
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
    const min = parts.find((p) => p.type === 'minute')?.value ?? '00'
    return `${h.padStart(2, '0')}:${min.padStart(2, '0')}`
  }
  return s.length >= 5 ? s.substring(0, 5) : s
}

async function postDiscordChannelMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (response.ok) {
    return true
  }
  const errorText = await response.text()
  console.error('❌ Discord API メッセージ送信失敗:', channelId, errorText)
  return false
}

/** DM用チャンネルIDを取得（ボットとユーザーが共通サーバーにいる必要あり） */
async function createDiscordDmChannel(botToken: string, recipientUserId: string): Promise<string | null> {
  const response = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: recipientUserId }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ Discord DMチャンネル作成失敗:', recipientUserId, errorText)
    return null
  }
  const data = await response.json()
  return data?.id || null
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 認証チェック（フロントエンドからの publishable key 対応）
    const authResult = await verifyAuth(req, undefined, { allowAnonymous: true })
    if (!authResult.success) {
      return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
    }

    const data: GMNotificationRequest = await req.json()
    console.log('📤 GM確定通知リクエスト:', { gmName: data.gmName, scenarioTitle: data.scenarioTitle })

    const formattedDate = formatEventDateLineJst(data.eventDate)
    const formattedTime = `${formatScheduleClockJst(data.startTime)}〜${formatScheduleClockJst(data.endTime)}`

    // Discord通知（個人チャンネル → DM → 組織の貸切用チャンネル＋メンション の順）
    try {
      const discordSettings = await getDiscordSettings(supabase, data.organizationId)
      const botToken = discordSettings?.botToken || Deno.env.get('DISCORD_BOT_TOKEN')
      const personalCh = (data.gmDiscordChannelId || '').trim()
      const discordUserId = (data.gmDiscordUserId || '').trim()
      const fallbackPrivateBookingCh = (discordSettings?.privateBookingChannelId || '').trim()

      if (botToken) {
        const embed = {
          title: '🎉 貸切公演が確定しました',
          description: `**担当GM:** ${data.gmName}`,
          color: 0x10b981,
          fields: [
            { name: '📚 シナリオ', value: data.scenarioTitle, inline: false },
            { name: '📅 日程', value: `${formattedDate} ${formattedTime}`, inline: true },
            { name: '📍 会場', value: data.storeName, inline: true },
            { name: '👤 代表者', value: data.customerName, inline: true },
            { name: '👥 人数', value: `${data.participantCount}名`, inline: true },
          ],
          footer: { text: '貸切予約確定通知（担当GM向け）' },
          timestamp: new Date().toISOString(),
        }

        let discordSent = false

        if (personalCh) {
          discordSent = await postDiscordChannelMessage(botToken, personalCh, { embeds: [embed] })
          if (discordSent) {
            console.log('✅ Discord通知送信成功（個人チャンネル）:', personalCh)
          }
        }

        if (!discordSent && discordUserId) {
          const dmId = await createDiscordDmChannel(botToken, discordUserId)
          if (dmId) {
            discordSent = await postDiscordChannelMessage(botToken, dmId, { embeds: [embed] })
            if (discordSent) {
              console.log('✅ Discord通知送信成功（DM）:', data.gmName)
            }
          }
        }

        if (!discordSent && fallbackPrivateBookingCh) {
          const content = discordUserId ? `<@${discordUserId}>` : undefined
          const payload: Record<string, unknown> = { embeds: [embed] }
          if (content) payload.content = content
          discordSent = await postDiscordChannelMessage(botToken, fallbackPrivateBookingCh, payload)
          if (discordSent) {
            console.log(
              '✅ Discord通知送信成功（貸切用チャンネル）:',
              fallbackPrivateBookingCh,
              discordUserId ? 'with mention' : 'no user id'
            )
          }
        }

        if (!discordSent && (personalCh || discordUserId || fallbackPrivateBookingCh)) {
          console.warn('⚠️ Discord通知を送信できませんでした（トークン・権限・チャンネルIDを確認）', {
            gmName: data.gmName,
            hadPersonalCh: !!personalCh,
            hadUserId: !!discordUserId,
            hadFallbackCh: !!fallbackPrivateBookingCh,
          })
        } else if (!discordSent) {
          console.log('ℹ️ Discord通知スキップ（個人チャンネル・ユーザーID・貸切用チャンネルいずれも未設定）', {
            gmName: data.gmName,
          })
        }
      } else {
        console.warn('⚠️ DISCORD_BOT_TOKEN / 組織の bot token が未設定のためDiscord通知スキップ')
      }
    } catch (discordError) {
      console.error('Discord通知エラー:', discordError)
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
