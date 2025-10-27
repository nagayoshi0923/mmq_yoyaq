// Discord Botで1ヶ月分のシフト募集通知を送信
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ShiftRequestPayload {
  year: number
  month: number
  deadline?: string
  targetChannelId?: string
}

/**
 * 1ヶ月分のカレンダーメッセージを生成
 */
function generateMonthCalendar(year: number, month: number): string {
  const daysInMonth = new Date(year, month, 0).getDate()
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']
  
  let message = `**【${year}年${month}月シフト募集】**\n\n`
  
  // 1ヶ月分の日程を生成
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const weekday = weekdays[date.getDay()]
    const emoji = date.getDay() === 0 ? '🔴' : date.getDay() === 6 ? '🔵' : '📅'
    
    message += `${emoji} ${month}/${day}(${weekday}) [朝] [昼] [夜] [終日]\n`
  }
  
  message += `\n⏰ **締切**: 前月25日 23:59まで\n`
  message += `💡 **提出方法**: 下記ボタンからシフト提出ページへ\n`
  
  return message
}

/**
 * Discordメッセージを送信
 */
async function sendDiscordShiftRequest(
  channelId: string,
  year: number,
  month: number,
  deadline: string
): Promise<void> {
  const calendarMessage = generateMonthCalendar(year, month)
  
  // シフト提出ページへのリンクボタン
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5, // リンクボタン（青色）
          label: "シフト提出ページを開く",
          url: `${Deno.env.get('SITE_URL') || 'https://your-site.com'}/#/shift-submission`
        }
      ]
    }
  ]
  
  const payload = {
    content: `@here\n\n${calendarMessage}`,
    components: components
  }
  
  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
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
  console.log('✅ Discord shift request sent:', result.id)
}

serve(async (req) => {
  try {
    const payload: ShiftRequestPayload = await req.json()
    console.log('📨 Shift request payload:', payload)
    
    const { year, month, deadline, targetChannelId } = payload
    
    // 年月のバリデーション
    if (!year || !month || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: 'Invalid year or month' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
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
    
    // Discord通知を送信
    await sendDiscordShiftRequest(channelId, year, month, deadlineDate)
    
    // 送信記録を保存（オプション）
    await supabase.from('shift_notifications').insert({
      year,
      month,
      deadline: deadlineDate,
      channel_id: channelId,
      sent_at: new Date().toISOString()
    })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Shift request notification sent',
        year,
        month,
        deadline: deadlineDate
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

