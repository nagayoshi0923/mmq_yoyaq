// @ts-nocheck
// Discord Bot経由で通知を送信（ボタン付き）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings, getNotificationSettings } from '../_shared/organization-settings.ts'
import { errorResponse, getCorsHeaders, sanitizeErrorMessage, timingSafeEqualString, verifyAuth, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
// フォールバック用（組織設定がない場合）
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')

// Supabaseクライアントを初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function isSystemCall(req: Request): boolean {
  return isCronOrServiceRoleCall(req)
}

function timeToMinutes(time: string): number {
  const [h, m] = (time || '').split(':')
  return (parseInt(h || '0', 10) * 60) + parseInt(m || '0', 10)
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  const aS = timeToMinutes(startA)
  const aE = timeToMinutes(endA)
  const bS = timeToMinutes(startB)
  const bE = timeToMinutes(endB)
  return aS < bE && aE > bS
}

async function getOrgIdForBooking(booking: any): Promise<string | null> {
  if (booking?.organization_id) return booking.organization_id
  if (booking?.id) {
    const { data } = await supabase
      .from('reservations')
      .select('organization_id')
      .eq('id', booking.id)
      .maybeSingle()
    if (data?.organization_id) return data.organization_id
  }
  if (booking?.scenario_id) {
    const { data } = await supabase
      .from('scenarios')
      .select('organization_id')
      .eq('id', booking.scenario_id)
      .maybeSingle()
    if (data?.organization_id) return data.organization_id
  }
  return null
}

async function computeConflictCandidateOrders(
  booking: any,
  gmNames: string[]
): Promise<Set<number>> {
  const candidates = booking?.candidate_datetimes?.candidates || []
  if (!candidates.length || !gmNames.length) return new Set()

  const orgId = await getOrgIdForBooking(booking)
  if (!orgId) return new Set()

  const dates = Array.from(new Set(candidates.map((c: any) => c.date).filter(Boolean)))
  if (!dates.length) return new Set()

  // 同チャンネルに複数GMがいる場合は union で⚠️を付ける
  const { data: events } = await supabase
    .from('schedule_events')
    .select('date, start_time, end_time, gms, scenario')
    .eq('organization_id', orgId)
    .eq('is_cancelled', false)
    .in('date', dates)
    .overlaps('gms', gmNames)

  const conflictOrders = new Set<number>()
  for (const candidate of candidates) {
    const cStart = (candidate.startTime || '').substring(0, 5)
    const cEnd = (candidate.endTime || '').substring(0, 5)
    if (!candidate.date || !cStart || !cEnd) continue

    const dateEvents = (events || []).filter((e: any) => e.date === candidate.date)
    const hasConflict = dateEvents.some((e: any) => {
      const eStart = (e.start_time || '').substring(0, 5)
      const eEnd = (e.end_time || '').substring(0, 5)
      if (!eStart || !eEnd) return false
      return overlaps(cStart, cEnd, eStart, eEnd)
    })
    if (hasConflict) conflictOrders.add(candidate.order)
  }
  return conflictOrders
}

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

// 個別チャンネルに通知をキューへ積む
async function sendNotificationToGMChannels(booking: any) {
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
  
  // 各ユニークなチャンネルに通知をキューへ積む（送信は retry-discord-notifications が担当）
  const notificationPromises = Array.from(uniqueChannels.values()).map(async ({ channelId, gmNames, userIds }) => {
    console.log(`📥 Queuing notification to channel ${channelId} (GMs: ${gmNames.join(', ')}, UserIDs: ${userIds.join(', ')})`)
    return enqueueDiscordNotification(channelId, booking, gmNames, userIds)
  })
  
  // 全ての通知を並行送信
  const results = await Promise.allSettled(notificationPromises)
  
  // 結果をログ出力
  const channelEntries = Array.from(uniqueChannels.entries())
  results.forEach((result, index) => {
    const [channelId, { gmNames }] = channelEntries[index]
    if (result.status === 'fulfilled') {
        console.log(`✅ Notification queued to channel ${channelId} (GMs: ${gmNames.join(', ')})`)
    } else {
      console.error(`❌ Failed to queue notification to channel ${channelId}:`, result.reason)
    }
  })
}

// 曜日を取得するヘルパー関数
function getDayOfWeek(dateString: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const date = new Date(dateString + 'T00:00:00+09:00')
  return days[date.getDay()]
}

// Discord通知をキューに積む（送信はリトライ関数が担当）
async function enqueueDiscordNotification(channelId: string, booking: any, gmNames: string[], userIds: string[] = []) {
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
  const conflictOrders = await computeConflictCandidateOrders(booking, gmNames)
  
  // メッセージ本文を作成
  const scenarioTitle = booking.scenario_title || booking.title || 'シナリオ名不明'
  const candidateCount = candidates.length
  const createdDate = new Date(booking.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  
  let messageContent = `**【貸切希望】${scenarioTitle}（候補${candidateCount}件）を受け付けました。**\n`
  messageContent += `出勤可能な日程を選択してください。\n\n`
  if (conflictOrders.size > 0) {
    const list = Array.from(conflictOrders).sort((a, b) => a - b).map(n => `候補${n}`).join(', ')
    messageContent += `⚠️ **既存予定と重複の可能性あり**: ${list}\n`
    messageContent += `（自分の予定を確認してから選択してください）\n\n`
  }
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
    const order = candidate.order ?? (i + 1)
    const warn = conflictOrders.has(order) ? '⚠️ ' : ''
    const buttonLabel = `${warn}候補${i + 1}: ${shortDate} ${timeSlot} ${candidate.startTime}-${candidate.endTime}`
    
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

  const orgId = await getOrgIdForBooking(booking)
  if (!orgId) {
    throw new Error('organization_id is not available for booking')
  }

  const notificationType = 'private_booking_request'
  const referenceId = booking?.id || null
  const webhookUrl = `https://discord.com/api/v10/channels/${channelId}/messages`

  const { data: queued, error: queueError } = await supabase
    .from('discord_notification_queue')
    .upsert({
      organization_id: orgId,
      webhook_url: webhookUrl,
      message_payload: discordPayload,
      notification_type: notificationType,
      reference_id: referenceId,
      status: 'pending',
      retry_count: 0,
      max_retries: 3,
      next_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'organization_id,notification_type,reference_id,webhook_url',
      ignoreDuplicates: true
    })
    .select('id')
    .maybeSingle()

  if (queueError) throw queueError

  if (!queued?.id) {
    console.log(`⏭️ Duplicate notification skipped (reservation=${referenceId}, channel=${channelId})`)
    return { skipped: true }
  }

  console.log(`📥 Queued Discord notification: ${queued.id} (reservation=${referenceId}, channel=${channelId})`)
  return { queued_id: queued.id }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 認可:
    // - DB Webhook / cron（service role）からの呼び出しを許可
    // - それ以外は admin / license_admin / owner のみ許可（誤爆防止）
    if (!isSystemCall(req)) {
      const auth = await verifyAuth(req, ['admin', 'license_admin', 'owner'])
      if (!auth.success) {
        return errorResponse(auth.error || 'forbidden', auth.statusCode || 403, corsHeaders)
      }
    }

    const body = await req.text()
    const payload: PrivateBookingNotification = JSON.parse(body)
    
    // 新規作成のみ通知
    if (payload.type.toLowerCase() !== 'insert') {
      return new Response(
        JSON.stringify({ message: 'Not a new booking' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      )
    }

    console.log('✅ Processing insert operation')
    const booking = payload.record
    
    // デモ予約の場合は通知をスキップ
    if (booking.reservation_source === 'demo' || booking.reservation_source === 'demo_auto') {
      return new Response(
        JSON.stringify({ message: 'Demo reservation - notification skipped' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      )
    }

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
    if (organizationId) {
      const discordSettings = await getDiscordSettings(supabase, organizationId)
      if (discordSettings.botToken) console.log('✅ Using organization-specific Discord settings')
      
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
    
    // Bot Tokenが無い場合はキューにも積まない（リトライ側が送れないため）
    const discordSettingsForSend = organizationId ? await getDiscordSettings(supabase, organizationId) : { botToken: FALLBACK_DISCORD_BOT_TOKEN }
    if (!discordSettingsForSend?.botToken) {
      console.error('❌ Discord Bot Token not configured')
      return new Response(
        JSON.stringify({ error: 'Discord Bot Token not configured' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      )
    }
    
    // 各GMの個別チャンネルに通知をキューへ積む（送信は retry-discord-notifications が担当）
    await sendNotificationToGMChannels(booking)

    return new Response(
      JSON.stringify({ 
        message: 'Individual notifications queued successfully',
        booking_id: booking.id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: sanitizeErrorMessage(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})

