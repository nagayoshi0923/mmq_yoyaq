// Discord Botでシンプルなシフト募集通知を送信（リンク誘導型）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') || 'https://your-site.com'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ShiftRequestPayload {
  year: number
  month: number
  deadline?: string
  targetChannelId?: string
}

/**
 * シフト募集メッセージを生成
 */
function generateShiftRequestMessage(year: number, month: number, deadline: string): string {
  const daysInMonth = new Date(year, month, 0).getDate()
  
  let message = `**【${year}年${month}月シフト募集】**\n\n`
  message += `📅 **対象月**: ${year}年${month}月（${daysInMonth}日間）\n`
  message += `⏰ **締切**: ${deadline}\n\n`
  message += `下記リンクからシフトを提出してください。\n`
  message += `出勤可能な日付・時間帯を選択してください。\n`
  
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
): Promise<string> {
  const message = generateShiftRequestMessage(year, month, deadline)
  
  // シフト提出ページへのリンクボタン
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5, // リンクボタン（青色）
          label: "シフト提出ページを開く",
          url: `${SITE_URL}/#/shift-submission`
        }
      ]
    }
  ]
  
  const payload = {
    content: `@here\n\n${message}`,
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
  return result.id
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 環境変数チェック
    if (!DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN is not set')
    }
    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL is not set')
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    }
    
    const payload: ShiftRequestPayload = await req.json()
    console.log('📨 Shift request payload:', payload)
    
    const { year, month, deadline, targetChannelId } = payload
    
    // 年月のバリデーション
    if (!year || !month || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: 'Invalid year or month' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // 設定から通知日・締切日を取得
    const { data: settingsData } = await supabase
      .from('notification_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
    
    const settings = settingsData && settingsData.length > 0 ? settingsData[0] : null
    
    const notificationDay = settings?.shift_notification_day || 25
    const deadlineDay = settings?.shift_deadline_day || 25
    
    // 締切日のデフォルト設定
    const deadlineDate = deadline || (() => {
      const deadlineYear = month === 1 ? year - 1 : year
      const deadlineMonth = month === 1 ? 12 : month - 1
      return `${deadlineYear}年${deadlineMonth}月${deadlineDay}日 23:59`
    })()
    
    // 全スタッフのDiscordチャンネルIDを取得
    const { data: staffList, error: staffError } = await supabase
      .from('staff')
      .select('id, name, discord_channel_id')
      .eq('is_active', true)
      .not('discord_channel_id', 'is', null)
    
    if (staffError) {
      console.error('❌ Staff fetch error:', staffError)
      throw new Error(`Failed to fetch staff: ${staffError.message}`)
    }
    
    console.log(`📋 Found ${staffList?.length || 0} active staff with Discord channel ID`)
    
    if (!staffList || staffList.length === 0) {
      throw new Error('No active staff with Discord channel ID found')
    }
    
    // 各スタッフのチャンネルに送信
    const messageIds: string[] = []
    const failedStaff: string[] = []
    
    for (const staff of staffList) {
      try {
        console.log(`📤 Sending to ${staff.name} (${staff.discord_channel_id})`)
        const messageId = await sendDiscordShiftRequest(
          staff.discord_channel_id,
          year,
          month,
          deadlineDate
        )
        messageIds.push(messageId)
        
        // レート制限を避けるため少し待つ
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`❌ Failed to send to ${staff.name}:`, error)
        failedStaff.push(staff.name)
      }
    }
    
    // 送信記録を保存
    await supabase.from('shift_notifications').insert({
      year,
      month,
      deadline: deadlineDate,
      channel_id: 'multiple', // 複数チャンネル
      message_ids: messageIds,
      sent_at: new Date().toISOString()
    })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Shift request notification sent',
        year,
        month,
        deadline: deadlineDate,
        notification_day: notificationDay,
        deadline_day: deadlineDay,
        sent_to: staffList.length,
        success_count: messageIds.length,
        failed_staff: failedStaff
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

