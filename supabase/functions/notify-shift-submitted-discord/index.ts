// シフト提出完了時のDiscord通知
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ShiftSubmittedPayload {
  staff_id: string
  year: number
  month: number
  shifts: Array<{
    date: string
    morning: boolean
    afternoon: boolean
    evening: boolean
    all_day: boolean
  }>
}

/**
 * シフトサマリーを生成
 */
function generateShiftSummary(shifts: ShiftSubmittedPayload['shifts']): {
  totalDays: number
  morningCount: number
  afternoonCount: number
  eveningCount: number
  allDayCount: number
} {
  let totalDays = 0
  let morningCount = 0
  let afternoonCount = 0
  let eveningCount = 0
  let allDayCount = 0
  
  shifts.forEach(shift => {
    if (shift.all_day) {
      allDayCount++
      totalDays++
    } else {
      if (shift.morning) morningCount++
      if (shift.afternoon) afternoonCount++
      if (shift.evening) eveningCount++
      
      if (shift.morning || shift.afternoon || shift.evening) {
        totalDays++
      }
    }
  })
  
  return { totalDays, morningCount, afternoonCount, eveningCount, allDayCount }
}

/**
 * Discordメッセージを送信
 */
async function sendDiscordNotification(
  channelId: string,
  staffName: string,
  year: number,
  month: number,
  summary: ReturnType<typeof generateShiftSummary>
): Promise<void> {
  const { totalDays, morningCount, afternoonCount, eveningCount, allDayCount } = summary
  
  let message = `**${staffName}**がシフトを提出しました\n\n`
  message += `対象月: ${year}年${month}月\n`
  message += `出勤可能日数: ${totalDays}日\n\n`
  
  if (allDayCount > 0) {
    message += `終日: ${allDayCount}日\n`
  }
  if (morningCount > 0) {
    message += `朝(10-14時): ${morningCount}日\n`
  }
  if (afternoonCount > 0) {
    message += `昼(14-18時): ${afternoonCount}日\n`
  }
  if (eveningCount > 0) {
    message += `夜(18-22時): ${eveningCount}日\n`
  }
  
  const payload = {
    content: message
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
  console.log('✅ Discord notification sent:', result.id)
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
    const payload: ShiftSubmittedPayload = await req.json()
    console.log('📨 Shift submitted payload:', payload)
    
    const { staff_id, year, month, shifts } = payload
    
    // スタッフ情報を取得
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('name, discord_channel_id')
      .eq('id', staff_id)
      .single()
    
    if (staffError || !staff) {
      throw new Error('Staff not found')
    }
    
    // チャンネルIDを取得（スタッフ個別 or 全体）
    let channelId = staff.discord_channel_id
    
    if (!channelId) {
      const { data: settings } = await supabase
        .from('notification_settings')
        .select('discord_shift_channel_id')
        .single()
      
      channelId = settings?.discord_shift_channel_id
    }
    
    if (!channelId) {
      console.log('⚠️ Discord channel not configured, skipping notification')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Notification skipped (no channel configured)' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // シフトのサマリーを生成
    const summary = generateShiftSummary(shifts)
    
    // Discord通知を送信
    await sendDiscordNotification(
      channelId,
      staff.name,
      year,
      month,
      summary
    )
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Shift submitted notification sent',
        staff_name: staff.name,
        summary
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

