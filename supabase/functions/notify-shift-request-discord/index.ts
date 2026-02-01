// Discord Botで1ヶ月分のシフト募集通知を送信
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import { 
  getServiceRoleKey, 
  getCorsHeaders, 
  verifyAuth, 
  errorResponse, 
  sanitizeErrorMessage,
  isCronOrServiceRoleCall 
} from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ShiftRequestPayload {
  organizationId?: string  // マルチテナント対応
  year: number
  month: number
  deadline?: string
  targetChannelId?: string
}

/**
 * 週のカレンダーメッセージを生成
 */
function generateWeekMessage(year: number, month: number, weekNumber: number, startDay: number, endDay: number): string {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  
  let message = `**【${year}年${month}月シフト募集】第${weekNumber}週**\n\n`
  message += `📅 **${month}/${startDay} 〜 ${month}/${endDay}**\n`
  message += `⏰ **締切**: 前月25日 23:59まで\n\n`
  message += `出勤可能な日付・時間帯のボタンを押してください\n`
  message += `（押すと緑色になります。もう一度押すと取り消せます）\n`
  
  return message
}

/**
 * 週ごとの日程ボタンを生成
 */
function generateWeekButtons(year: number, month: number, startDay: number, endDay: number, notificationId: string): any[] {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  const components: any[] = []
  
  // 各日付のボタンを作成
  for (let day = startDay; day <= endDay; day++) {
    const date = new Date(year, month - 1, day)
    const weekday = weekdays[date.getDay()]
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    
    // 日付ラベル用の行
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2, // 灰色（未選択）
          label: `${month}/${day}(${weekday})`,
          custom_id: `shift_date_${dateStr}_label_${notificationId}`,
          disabled: true // ラベルなのでクリック不可
        }
      ]
    })
    
    // 時間帯ボタンの行
    components.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 3, // 緑色（未選択）
          label: "朝",
          custom_id: `shift_${dateStr}_morning_${notificationId}`
        },
        {
          type: 2,
          style: 3, // 緑色（未選択）
          label: "昼",
          custom_id: `shift_${dateStr}_afternoon_${notificationId}`
        },
        {
          type: 2,
          style: 3, // 緑色（未選択）
          label: "夜",
          custom_id: `shift_${dateStr}_evening_${notificationId}`
        },
        {
          type: 2,
          style: 3, // 緑色（未選択）
          label: "終日",
          custom_id: `shift_${dateStr}_allday_${notificationId}`
        }
      ]
    })
  }
  
  return components
}

/**
 * 週ごとにDiscordメッセージを送信
 */
async function sendDiscordShiftRequest(
  channelId: string,
  year: number,
  month: number,
  deadline: string,
  notificationId: string,
  discordBotToken: string
): Promise<string[]> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const messageIds: string[] = []
  
  // 2日ずつに分割（Discordは1メッセージ最大5行まで）
  const weeks: Array<{ start: number, end: number }> = []
  for (let day = 1; day <= daysInMonth; day += 2) {
    weeks.push({
      start: day,
      end: Math.min(day + 1, daysInMonth)
    })
  }
  
  // 各週のメッセージを送信
  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i]
    const weekNumber = i + 1
    
    const message = generateWeekMessage(year, month, weekNumber, week.start, week.end)
    const components = generateWeekButtons(year, month, week.start, week.end, notificationId)
    
    const payload = {
      content: i === 0 ? `@here\n\n${message}` : message,
      components: components
    }
    
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${discordBotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Discord API error: ${response.status} - ${errorText}`)
    }
    
    const result = await response.json()
    messageIds.push(result.id)
    console.log(`✅ Week ${weekNumber} message sent:`, result.id)
    
    // Discord APIのレート制限を避けるため、少し待つ
    if (i < weeks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return messageIds
}

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // 🔒 認証チェック: Service Role/Cron または admin/staff のみ許可
    if (!isCronOrServiceRoleCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'staff', 'owner', 'license_admin'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: notify-shift-request-discord への不正アクセス試行')
        return errorResponse(
          authResult.error || '認証が必要です',
          authResult.statusCode || 401,
          corsHeaders
        )
      }
      console.log('✅ 認証成功:', authResult.user?.email)
    } else {
      console.log('✅ Service Role/Cron 呼び出し')
    }

    const payload: ShiftRequestPayload = await req.json()
    console.log('📨 Shift request payload:', payload)
    
    const { organizationId, year, month, deadline, targetChannelId } = payload
    
    // 年月のバリデーション
    if (!year || !month || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: 'Invalid year or month' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // 組織設定からDiscord設定を取得
    let discordBotToken = FALLBACK_DISCORD_BOT_TOKEN
    if (organizationId) {
      const discordSettings = await getDiscordSettings(supabase, organizationId)
      if (discordSettings.botToken) {
        discordBotToken = discordSettings.botToken
      }
    }
    
    if (!discordBotToken) {
      throw new Error('Discord Bot Token is not configured')
    }
    
    // 締切日のデフォルト設定（前月25日）
    const deadlineDate = deadline || (() => {
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      return `${prevYear}-${String(prevMonth).padStart(2, '0')}-25 23:59`
    })()
    
    // チャンネルIDの取得
    let channelId = targetChannelId
    
    if (!channelId) {
      // デフォルトチャンネルIDを取得（全スタッフ共通）
      const { data: settings } = await supabase
        .from('notification_settings')
        .select('discord_shift_channel_id')
        .single()
      
      channelId = settings?.discord_shift_channel_id
    }
    
    if (!channelId) {
      throw new Error('Discord shift channel ID is not configured')
    }
    
    // 送信記録を作成（IDを生成）
    const { data: notification, error: notificationError } = await supabase
      .from('shift_notifications')
      .insert({
        year,
        month,
        deadline: deadlineDate,
        channel_id: channelId,
        sent_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (notificationError) {
      throw new Error(`Failed to create notification record: ${notificationError.message}`)
    }
    
    const notificationId = notification.id
    
    // Discord通知を送信（週ごとに分割）
    const messageIds = await sendDiscordShiftRequest(channelId, year, month, deadlineDate, notificationId, discordBotToken!)
    
    // メッセージIDを保存
    await supabase
      .from('shift_notifications')
      .update({ message_ids: messageIds })
      .eq('id', notificationId)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Shift request notification sent',
        year,
        month,
        deadline: deadlineDate
      }),
      { status: 200, headers: corsHeaders }
    )
    
  } catch (error) {
    console.error('❌ Error:', error)
    return errorResponse(
      sanitizeErrorMessage(error, 'シフト通知の送信に失敗しました'),
      500,
      corsHeaders
    )
  }
})

