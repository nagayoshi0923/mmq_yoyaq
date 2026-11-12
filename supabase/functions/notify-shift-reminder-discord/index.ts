import '../_shared/outbound-guard.ts'
// シフト未提出者へのリマインダー通知
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import { errorResponse, sanitizeErrorMessage, timingSafeEqualString, getServiceRoleKey } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface ReminderPayload {
  organizationId: string  // マルチテナント対応（必須）
  year: number
  month: number
  deadline: string
}

// Service Role Key による呼び出しかチェック（Cron向け）
function isServiceRoleCall(req: Request): boolean {
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = getServiceRoleKey()
  if (!authHeader || !serviceRoleKey) return false
  const token = authHeader.replace('Bearer ', '')
  return timingSafeEqualString(token, serviceRoleKey)
}

/**
 * 未提出者リストを取得
 */
async function getUnsubmittedStaff(organizationId: string, year: number, month: number): Promise<Array<{
  id: string
  name: string
  discord_user_id?: string
}>> {
  // 全スタッフを取得
  const { data: allStaff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, discord_user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  
  if (staffError) {
    throw new Error(`Failed to fetch staff: ${staffError.message}`)
  }
  
  // 対象月のシフト提出者を取得
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`
  
  const { data: submittedShifts, error: shiftError } = await supabase
    .from('staff_shifts')
    .select('staff_id')
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('status', 'submitted')
  
  if (shiftError) {
    throw new Error(`Failed to fetch shifts: ${shiftError.message}`)
  }
  
  // 提出済みスタッフIDのセット
  const submittedStaffIds = new Set(
    submittedShifts.map(shift => shift.staff_id)
  )
  
  // 未提出者をフィルター
  const unsubmittedStaff = allStaff.filter(
    staff => !submittedStaffIds.has(staff.id)
  )
  
  return unsubmittedStaff
}

/**
 * Discordリマインダーを送信
 */
async function sendDiscordReminder(
  channelId: string,
  botToken: string,
  unsubmittedStaff: Array<{ id: string; name: string; discord_user_id?: string }>,
  year: number,
  month: number,
  deadline: string
): Promise<void> {
  // メンション文字列を生成
  const mentions = unsubmittedStaff
    .map(staff => {
      if (staff.discord_user_id) {
        return `<@${staff.discord_user_id}>`
      }
      return staff.name
    })
    .join(' ')
  
  // 締切までの残り日数を計算
  const deadlineDate = new Date(deadline)
  const now = new Date()
  const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  
  let message = `⚠️ **シフト提出リマインダー**\n\n`
  message += `${mentions}\n\n`
  message += `📅 **対象月**: ${year}年${month}月\n`
  message += `⏰ **締切**: ${deadline}\n`
  message += `⏳ **残り**: ${daysLeft}日\n\n`
  message += `まだシフトを提出していません。\n`
  message += `締切までに提出をお願いします。\n`
  
  // シフト提出ページへのリンクボタン
  const components = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 5, // リンクボタン
          label: "シフト提出ページを開く",
          url: `${Deno.env.get('SITE_URL') || 'https://mmq.game'}/#/shift-submission`
        }
      ]
    }
  ]
  
  const payload = {
    content: message,
    components: components
  }
  
  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
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
  console.log('✅ Discord reminder sent:', result.id)
}

serve(async (req) => {
  try {
    // Service Role のみ許可（Cronジョブからの呼び出し）
    if (!isServiceRoleCall(req)) {
      return errorResponse('Unauthorized', 401, { 'Content-Type': 'application/json' })
    }

    const payload: ReminderPayload = await req.json()
    console.log('📨 Reminder payload received')
    
    const { year, month, deadline } = payload
    const organizationId = payload.organizationId

    if (!organizationId) {
      return new Response(JSON.stringify({ success: false, error: 'organizationId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 未提出者を取得
    const unsubmittedStaff = await getUnsubmittedStaff(organizationId, year, month)
    
    if (unsubmittedStaff.length === 0) {
      console.log('✅ All staff have submitted shifts')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'All staff have submitted shifts',
          unsubmitted_count: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // チャンネルID/設定を取得（組織スコープ）
    const { data: settings } = await serviceClient
      .from('notification_settings')
      .select('discord_shift_channel_id, shift_notification_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle()
    
    if (!settings?.shift_notification_enabled) {
      console.log('⚠️ Shift notifications are disabled')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Shift notifications are disabled',
          unsubmitted_count: unsubmittedStaff.length
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const channelId = settings.discord_shift_channel_id
    
    if (!channelId) {
      throw new Error('Discord shift channel ID is not configured')
    }

    // Bot token（組織別 > fallback）
    const discord = await getDiscordSettings(serviceClient, organizationId)
    const botToken = discord.botToken || FALLBACK_DISCORD_BOT_TOKEN
    if (!botToken) {
      throw new Error('Discord bot token is not configured')
    }
    
    // Discord通知を送信
    await sendDiscordReminder(
      channelId,
      botToken,
      unsubmittedStaff,
      year,
      month,
      deadline
    )
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Reminder sent',
        unsubmitted_count: unsubmittedStaff.length,
        unsubmitted_staff: unsubmittedStaff.map(s => s.name)
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('❌ Error:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ 
        error: sanitizeErrorMessage(msg || 'Unknown error')
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

