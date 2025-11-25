// Discord Bot経由で通知を送信（ボタン付き）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Supabaseクライアントを初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

interface PrivateBookingNotification {
  type: 'insert'
  table: string
  record: {
    id: string
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

// 個別チャンネルに通知を送信する関数
async function sendNotificationToGMChannels(booking: any) {
  console.log('📤 Sending notifications to individual GM channels...')
  console.log(`📋 Scenario ID: ${booking.scenario_id}`)
  
  // このシナリオを担当しているGMを取得
  const { data: assignments, error: assignmentError } = await supabase
    .from('staff_scenario_assignments')
    .select('staff_id')
    .eq('scenario_id', booking.scenario_id)
  
  if (assignmentError) {
    console.error('❌ Error fetching scenario assignments:', assignmentError)
    return
  }
  
  if (!assignments || assignments.length === 0) {
    console.log('⚠️ No GMs assigned to this scenario')
    return
  }
  
  const assignedStaffIds = assignments.map(a => a.staff_id)
  console.log(`📋 Found ${assignedStaffIds.length} GM(s) assigned to this scenario`)
  
  // 担当GMのDiscordチャンネル情報を取得
  const { data: gmStaff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, discord_channel_id')
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
  
  // 各GMのチャンネルに通知を送信
  const notificationPromises = gmStaff.map(async (gm) => {
    const channelId = gm.discord_channel_id
    
    // チャンネルIDが設定されていない場合はスキップ
    if (!channelId || channelId.trim() === '') {
      console.log(`⚠️ Skipping ${gm.name}: discord_channel_id not set`)
      throw new Error(`discord_channel_id not set for ${gm.name}`)
    }
    
    console.log(`📤 Sending notification to ${gm.name} (Channel: ${channelId})`)
    return sendDiscordNotification(channelId, booking)
  })
  
  // 全ての通知を並行送信
  const results = await Promise.allSettled(notificationPromises)
  
  // 結果をログ出力
  results.forEach((result, index) => {
    const gm = gmStaff[index]
    if (result.status === 'fulfilled') {
      console.log(`✅ Notification sent to ${gm.name}`)
    } else {
      console.error(`❌ Failed to send notification to ${gm.name}:`, result.reason)
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
async function sendDiscordNotification(channelId: string, booking: any) {
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
  
  // 候補日時の詳細リストを追加
  messageContent += `\n**お客様希望候補日時：**\n`
  candidates.forEach((candidate, index) => {
    const timeSlot = timeSlotMap[candidate.timeSlot] || candidate.timeSlot
    messageContent += `**候補${index + 1}:** ${candidate.date}（${getDayOfWeek(candidate.date)}） ${timeSlot} ${candidate.startTime}-${candidate.endTime}\n`
  })
  messageContent += `\n出勤可能な候補を選択してください：`

  // 候補日程をボタンとして表示（シンプルに候補番号のみ）
  const components = []
  const maxButtons = Math.min(candidates.length, 5) // 最大5個まで
  
  for (let i = 0; i < maxButtons; i++) {
    if (i % 5 === 0) {
      components.push({
        type: 1,
        components: []
      })
    }
    
    components[components.length - 1].components.push({
      type: 2,
      style: 3, // 緑色
      label: `候補${i + 1}`,
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

  const discordPayload = {
    content: `@here\n\n${messageContent}`,
    components: components
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
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
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    }

    console.log('✅ Processing insert operation')
    const booking = payload.record

    // 通知設定をチェック
    const { data: notificationSettings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('new_reservation_discord')
      .eq('store_id', 'default') // デフォルト設定を使用
      .maybeSingle()

    if (settingsError) {
      console.error('通知設定取得エラー:', settingsError)
    }

    // Discord通知が無効の場合はスキップ
    if (notificationSettings && !notificationSettings.new_reservation_discord) {
      console.log('⚠️ Discord notifications are disabled in settings')
      return new Response(
        JSON.stringify({ message: 'Discord notifications are disabled' }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    }
    console.log('📋 Booking data:', {
      id: booking.id,
      customer_name: booking.customer_name,
      scenario_title: booking.scenario_title,
      reservation_source: booking.reservation_source
    })
    
    // 各GMの個別チャンネルに通知を送信
    await sendNotificationToGMChannels(booking)

    return new Response(
      JSON.stringify({ 
        message: 'Individual notifications sent successfully',
        booking_id: booking.id
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    )
  }
})

