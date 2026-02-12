// Discord Botでシンプルなシフト募集通知を送信（リンク誘導型）
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
const SITE_URL = Deno.env.get('SITE_URL') || 'https://mmq.game'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ShiftRequestPayload {
  organizationId?: string  // マルチテナント対応
  year: number
  month: number
  deadline?: string
  targetChannelId?: string
}

// Service Role Key による呼び出しかチェック
function isServiceRoleCall(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader || !serviceRoleKey) return false
  const token = authHeader.replace('Bearer ', '')
  return timingSafeEqualString(token, serviceRoleKey)
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
  deadline: string,
  discordBotToken: string
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
          url: `${SITE_URL}/#shift-submission`
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
  console.log('✅ Discord shift request sent:', result.id)
  return result.id
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 環境変数チェック
    if (!SUPABASE_URL) {
      throw new Error('SUPABASE_URL is not set')
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    }
    
    // 🔒 認証（Service Role または管理者）
    if (!isServiceRoleCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'owner', 'license_admin'])
      if (!authResult.success) {
        return errorResponse(authResult.error || 'Unauthorized', authResult.statusCode || 401, corsHeaders)
      }
    }

    const payload: ShiftRequestPayload = await req.json()
    console.log('📨 Shift request received')
    
    const { organizationId, year, month, deadline, targetChannelId } = payload

    if (!organizationId) {
      return errorResponse('organizationId is required', 400, corsHeaders)
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
      throw new Error('DISCORD_BOT_TOKEN is not set')
    }
    
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
      .select('shift_notification_day, shift_deadline_day')
      .eq('organization_id', organizationId)
      .maybeSingle()
    
    const settings = settingsData || null
    
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
      .not('discord_channel_id', 'is', null)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
    
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
          deadlineDate,
          discordBotToken!
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
      organization_id: organizationId,
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
    const msg = error instanceof Error ? error.message : String(error)
    console.error('❌ Error:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ 
        error: sanitizeErrorMessage(msg || 'Unknown error') 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

