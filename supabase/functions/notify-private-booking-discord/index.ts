// Discord Bot経由で通知を送信（ボタン付き）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings, getNotificationSettings } from '../_shared/organization-settings.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// フォールバック用（組織設定がない場合）
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')

// CORSヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Supabaseクライアントを初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface PrivateBookingNotification {
  type: 'insert'
  table: string
  record: {
    id: string
    organization_id?: string  // マルチテナント対応
    customer_name: string
    customer_email: string
    customer_phone: string
    scenario_id: string
    scenario_title: string
    participant_count: number
    candidate_datetimes: {
      candidates: Array<{
        order: number
        date: string
        timeSlot: string
        startTime: string
        endTime: string
      }>
      requestedStores?: Array<{
        storeId: string
        storeName: string
      }>
    }
    notes?: string
    created_at: string
  }
}

// シナリオタイトルを取得する関数
async function fetchScenarioTitle(scenarioId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('scenarios')
      .select('title')
      .eq('id', scenarioId)
      .single()
    
    if (error) {
      console.error('❌ Error fetching scenario title:', error)
      return null
    }
    return data?.title || null
  } catch (e) {
    console.error('❌ Exception fetching scenario title:', e)
    return null
  }
}

// 個別チャンネルに通知を送信する関数
async function sendNotificationToGMChannels(booking: any, discordBotToken: string) {
  console.log('📤 Sending notifications to individual GM channels...')
  console.log(`📋 Scenario ID: ${booking.scenario_id}`)
  
  // このシナリオを担当しているGMを取得（can_main_gm または can_sub_gm が true のスタッフのみ）
  const { data: assignments, error: assignmentError } = await supabase
    .from('staff_scenario_assignments')
    .select('staff_id')
    .eq('scenario_id', booking.scenario_id)
    .or('can_main_gm.eq.true,can_sub_gm.eq.true')
  
  if (assignmentError) {
    console.error('❌ Error fetching scenario assignments:', assignmentError)
    return
  }
  
  if (!assignments || assignments.length === 0) {
    console.log('⚠️ No GMs assigned to this scenario (with can_main_gm or can_sub_gm = true)')
    return
  }
  
  const assignedStaffIds = assignments.map(a => a.staff_id)
  console.log(`📋 Found ${assignedStaffIds.length} GM(s) assigned to this scenario`)
  
  // 担当GMのDiscordチャンネル情報を取得
  const { data: gmStaff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, discord_channel_id, discord_user_id')
    .in('id', assignedStaffIds)
    .eq('status', 'active')
    .not('discord_channel_id', 'is', null)
  
  if (staffError) {
    console.error('❌ Error fetching GM staff:', staffError)
    return
  }
  
  if (!gmStaff || gmStaff.length === 0) {
    console.log('⚠️ No assigned GMs with Discord channels found')
    return
  }
  
  console.log(`📋 Found ${gmStaff.length} GM(s) with Discord channels:`, gmStaff.map(g => g.name).join(', '))
  
  // チャンネルIDの重複を除外（同じチャンネルに複数回送信しないため）
  const uniqueChannels = new Map<string, { channelId: string, gmNames: string[], userIds: string[] }>()
  gmStaff.forEach(gm => {
    const channelId = gm.discord_channel_id?.trim()
    if (channelId) {
      if (uniqueChannels.has(channelId)) {
        const channel = uniqueChannels.get(channelId)!
        channel.gmNames.push(gm.name)
        if (gm.discord_user_id) {
          channel.userIds.push(gm.discord_user_id)
        }
      } else {
        uniqueChannels.set(channelId, { 
          channelId, 
          gmNames: [gm.name],
          userIds: gm.discord_user_id ? [gm.discord_user_id] : []
        })
      }
    }
  })
  
  console.log(`📋 Unique channels to notify: ${uniqueChannels.size} (from ${gmStaff.length} GMs)`)
  
  // 各ユニークなチャンネルに通知を送信
  const notificationPromises = Array.from(uniqueChannels.values()).map(async ({ channelId, gmNames, userIds }) => {
    console.log(`📤 Sending notification to channel ${channelId} (GMs: ${gmNames.join(', ')}, UserIDs: ${userIds.join(', ')})`)
    return sendDiscordNotification(channelId, booking, userIds, discordBotToken)
  })
  
  // 全ての通知を並行送信
  const results = await Promise.allSettled(notificationPromises)
  
  // 結果をログ出力
  const channelEntries = Array.from(uniqueChannels.entries())
  results.forEach((result, index) => {
    const [channelId, { gmNames }] = channelEntries[index]
    if (result.status === 'fulfilled') {
      console.log(`✅ Notification sent to channel ${channelId} (GMs: ${gmNames.join(', ')})`)
    } else {
      console.error(`❌ Failed to send notification to channel ${channelId}:`, result.reason)
    }
  })
}

// 曜日を取得するヘルパー関数
function getDayOfWeek(dateString: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const date = new Date(dateString + 'T00:00:00+09:00')
  return days[date.getDay()]
}

// Discord通知を送信する関数
async function sendDiscordNotification(channelId: string, booking: any, userIds: string[] = [], discordBotToken: string) {
  // チャンネルIDが空の場合はエラー
  if (!channelId || channelId.trim() === '') {
    throw new Error('Discord channel ID is not set. Please configure discord_channel_id in staff table.')
  }
  
  const timeSlotMap = {
    'morning': '朝',
    'afternoon': '昼', 
    'evening': '夜',
    '朝': '朝',
    '昼': '昼',
    '夜': '夜'
  }

  const candidates = booking.candidate_datetimes?.candidates || []
  
  // メッセージ本文を作成
  const scenarioTitle = booking.scenario_title || booking.title || 'シナリオ名不明'
  const candidateCount = candidates.length
  const createdDate = new Date(booking.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  
  let messageContent = `**【貸切希望】${scenarioTitle}（候補${candidateCount}件）を受け付けました。**\n`
  messageContent += `出勤可能な日程を選択してください。\n\n`
  messageContent += `**予約受付日：** ${createdDate}\n`
  messageContent += `**シナリオ：** ${scenarioTitle}\n`
  messageContent += `**参加人数：** ${booking.participant_count}名\n`
  messageContent += `**予約者：** ${booking.customer_name || '名前不明'}\n`

  // 候補日程をボタンとして表示（日時詳細付き）
  const components = []
  const maxButtons = Math.min(candidates.length, 5) // 最大5個まで
  
  for (let i = 0; i < maxButtons; i++) {
    const candidate = candidates[i]
    const timeSlot = timeSlotMap[candidate.timeSlot] || candidate.timeSlot
    
    // 月/日形式に変換（例: 2025-11-25 → 11/25）
    const dateMatch = candidate.date.match(/\d{4}-(\d{2})-(\d{2})/)
    const shortDate = dateMatch ? `${parseInt(dateMatch[1])}/${parseInt(dateMatch[2])}` : candidate.date
    
    if (i % 5 === 0) {
      components.push({
        type: 1,
        components: []
      })
    }
    
    // ボタンラベル: "候補1: 11/25 夜 18:00-21:00"
    const buttonLabel = `候補${i + 1}: ${shortDate} ${timeSlot} ${candidate.startTime}-${candidate.endTime}`
    
    components[components.length - 1].components.push({
      type: 2,
      style: 3, // 緑色
      label: buttonLabel.substring(0, 80), // Discord制限：80文字まで
      custom_id: `date_${i + 1}_${booking.id}`
    })
  }
  
  // 「全て不可」ボタンを別の行に追加
  components.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 4, // 赤色
        label: "全て不可",
        custom_id: `gm_unavailable_${booking.id}`
      }
    ]
  })

  // ユーザーメンションを作成（discord_user_idがあればそれを使う、なければ@here）
  const mention = userIds.length > 0 
    ? userIds.map(id => `<@${id}>`).join(' ')
    : '@here'
  
  const discordPayload = {
    content: `${mention}\n\n${messageContent}`,
    components: components
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${discordBotToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(discordPayload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const result = await response.json()
  console.log(`✅ Discord notification sent to channel ${channelId}, Message ID:`, result.id)
  return result
}

serve(async (req) => {
  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  console.log('🔥 Discord notification function called!')
  console.log('Request method:', req.method)
  console.log('Request headers:', Object.fromEntries(req.headers))
  
  try {
    const body = await req.text()
    console.log('Request body:', body)
    const payload: PrivateBookingNotification = JSON.parse(body)
    
    // 新規作成のみ通知
    if (payload.type.toLowerCase() !== 'insert') {
      console.log('❌ Not an insert operation:', payload.type)
      return new Response(
        JSON.stringify({ message: 'Not a new booking' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      )
    }

    console.log('✅ Processing insert operation')
    const booking = payload.record

    // 予約データにscenario_titleがない場合（reservationsテーブルなど）、DBから取得を試みる
    if (!booking.scenario_title && !booking.title && booking.scenario_id) {
      console.log('ℹ️ Scenario title missing in payload, fetching from DB...')
      const title = await fetchScenarioTitle(booking.scenario_id)
      if (title) {
        booking.scenario_title = title
        console.log(`✅ Fetched scenario title: ${title}`)
      }
    }

    // 組織IDを取得（payloadまたはシナリオから）
    let organizationId = booking.organization_id
    if (!organizationId && booking.scenario_id) {
      const { data: scenario } = await supabase
        .from('scenarios')
        .select('organization_id')
        .eq('id', booking.scenario_id)
        .single()
      organizationId = scenario?.organization_id
    }
    
    // 組織設定を取得
    let discordBotToken = FALLBACK_DISCORD_BOT_TOKEN
    if (organizationId) {
      const discordSettings = await getDiscordSettings(supabase, organizationId)
      if (discordSettings.botToken) {
        discordBotToken = discordSettings.botToken
        console.log('✅ Using organization-specific Discord settings')
      }
      
      // 通知設定をチェック
      const notificationSettings = await getNotificationSettings(supabase, organizationId)
      if (!notificationSettings.privateBookingDiscord) {
        console.log('⚠️ Discord notifications are disabled for this organization')
        return new Response(
          JSON.stringify({ message: 'Discord notifications are disabled' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        )
      }
    }
    
    if (!discordBotToken) {
      console.error('❌ Discord Bot Token not configured')
      return new Response(
        JSON.stringify({ error: 'Discord Bot Token not configured' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }
    
    console.log('📋 Booking data:', {
      id: booking.id,
      customer_name: booking.customer_name,
      scenario_title: booking.scenario_title,
      organization_id: organizationId
    })
    
    // 各GMの個別チャンネルに通知を送信
    await sendNotificationToGMChannels(booking, discordBotToken)

    return new Response(
      JSON.stringify({ 
        message: 'Individual notifications sent successfully',
        booking_id: booking.id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})

