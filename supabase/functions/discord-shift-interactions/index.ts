import '../_shared/outbound-guard.ts'
// Discordシフトボタンのインタラクション処理
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, checkRateLimit, getClientIP, rateLimitResponse, getServiceRoleKey } from '../_shared/security.ts'

// フォールバック用（組織設定がない場合）
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')
const FALLBACK_DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/**
 * Discord署名検証
 */
async function verifySignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  
  if (!signature || !timestamp) {
    return false
  }
  
  try {
    const encoder = new TextEncoder()
    const message = encoder.encode(timestamp + body)
    const publicKeyHex = FALLBACK_DISCORD_PUBLIC_KEY
    if (!publicKeyHex) return false
    const publicKey = hexToUint8Array(publicKeyHex)
    const signatureBytes = hexToUint8Array(signature)
    
    const key = await crypto.subtle.importKey(
      'raw',
      publicKey,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    )
    
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      signatureBytes,
      message
    )
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * ボタンの状態を取得
 */
async function getButtonState(
  staffId: string,
  date: string,
  timeSlot: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('shift_button_states')
    .select('is_selected')
    .eq('staff_id', staffId)
    .eq('date', date)
    .eq('time_slot', timeSlot)
    .single()
  
  if (error || !data) {
    return false
  }
  
  return data.is_selected
}

/**
 * ボタンの状態をトグル
 */
async function toggleButtonState(
  staffId: string,
  date: string,
  timeSlot: string,
  notificationId: string,
  organizationId: string
): Promise<boolean> {
  // 現在の状態を取得
  const currentState = await getButtonState(staffId, date, timeSlot)
  const newState = !currentState
  
  // 状態を保存（upsert）
  await supabase
    .from('shift_button_states')
    .upsert({
      organization_id: organizationId,
      staff_id: staffId,
      notification_id: notificationId,
      date,
      time_slot: timeSlot,
      is_selected: newState,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'staff_id,date,time_slot'
    })
  
  // shift_submissionsテーブルにも反映
  const column = timeSlot === 'allday' ? 'all_day' : timeSlot
  
  await supabase
    .from('shift_submissions')
    .upsert({
      organization_id: organizationId,
      staff_id: staffId,
      date,
      [column]: newState,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }, {
      onConflict: 'staff_id,date'
    })
  
  return newState
}

/**
 * メッセージのボタンを更新
 */
async function updateMessageButtons(
  channelId: string,
  messageId: string,
  components: any[]
): Promise<void> {
  const botToken = FALLBACK_DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('Discord Bot Token not configured')

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ components })
    }
  )
  
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Discord API error: ${response.status} - ${errorText}`)
  }
}

/**
 * シフトボタンクリックを処理
 */
async function handleShiftButtonClick(interaction: any): Promise<Response> {
  const customId = interaction.data.custom_id
  const parts = customId.split('_')
  
  // custom_id形式: shift_YYYY-MM-DD_TIMESLOT_NOTIFICATION_ID
  if (parts.length < 4 || parts[0] !== 'shift') {
    return new Response(
      JSON.stringify({ 
        type: 4,
        data: { content: 'エラー: 無効なボタンです', flags: 64 }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  const date = parts[1] // YYYY-MM-DD
  const timeSlot = parts[2] // morning, afternoon, evening, allday
  const notificationId = parts[3]

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(
      JSON.stringify({ type: 4, data: { content: 'エラー: 無効な日付です', flags: 64 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (!['morning', 'afternoon', 'evening', 'allday'].includes(timeSlot)) {
    return new Response(
      JSON.stringify({ type: 4, data: { content: 'エラー: 無効な時間帯です', flags: 64 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  // notificationId は UUID ではなく messageId 等の可能性があるので最低限チェックのみ
  if (!notificationId || notificationId.length < 6) {
    return new Response(
      JSON.stringify({ type: 4, data: { content: 'エラー: 無効なIDです', flags: 64 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  // Discord IDからstaff_idを取得
  const discordUserId = interaction.member?.user?.id || interaction.user?.id
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, organization_id')
    .eq('discord_user_id', discordUserId)
    .single()
  
  if (staffError || !staff) {
    return new Response(
      JSON.stringify({ 
        type: 4,
        data: { 
          content: 'エラー: スタッフ情報が見つかりません。\nDiscord IDがスタッフテーブルに登録されているか確認してください。',
          flags: 64
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  if (!staff.organization_id) {
    return new Response(
      JSON.stringify({ 
        type: 4,
        data: { content: 'エラー: 組織情報が取得できません', flags: 64 }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ボタン状態をトグル
  const newState = await toggleButtonState(staff.id, date, timeSlot, notificationId, staff.organization_id)
  
  // メッセージのボタンを更新
  const message = interaction.message
  const updatedComponents = message.components.map((row: any) => {
    return {
      ...row,
      components: row.components.map((button: any) => {
        if (button.custom_id === customId) {
          // 青（選択）⇔緑（未選択）
          return {
            ...button,
            style: newState ? 1 : 3 // 1=青, 3=緑
          }
        }
        return button
      })
    }
  })
  
  await updateMessageButtons(
    interaction.channel_id,
    interaction.message.id,
    updatedComponents
  )
  
  const timeSlotLabel = {
    morning: '朝',
    afternoon: '昼',
    evening: '夜',
    allday: '終日'
  }[timeSlot] || timeSlot
  
  const statusText = newState ? '✅ 選択しました' : '❌ 選択を解除しました'
  
  return new Response(
    JSON.stringify({
      type: 4,
      data: {
        content: `${statusText}\n📅 ${date} ${timeSlotLabel}`,
        flags: 64 // Ephemeral（本人にのみ表示）
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  console.log('🚀 Discord shift interactions function called!')
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  const body = await req.text()
  // 🔒 レート制限（Discordボタン連打/DoS対策）
  const clientIP = getClientIP(req)
  const rateLimit = await checkRateLimit(supabase, clientIP, 'discord-shift-interactions', 240, 60)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
  }
  
  // 署名検証
  const isValid = await verifySignature(req, body)
  
  if (!isValid) {
    return new Response('Invalid signature', { 
      status: 401,
      headers: corsHeaders 
    })
  }
  
  const interaction = JSON.parse(body)

  // 🔒 冪等化（Discord再送/リプレイ対策）
  const interactionId = interaction?.id
  if (typeof interactionId === 'string' && interactionId.length > 0) {
    const { data: dedupeRow } = await supabase
      .from('discord_interaction_dedupe')
      .upsert(
        { interaction_id: interactionId, handler: 'discord-shift-interactions' },
        { onConflict: 'interaction_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle()

    if (!dedupeRow?.id) {
      // 既に処理済み
      return new Response(
        JSON.stringify({ type: 6 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
  
  // PING に対して PONG を返す
  if (interaction.type === 1) {
    return new Response(
      JSON.stringify({ type: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  // ボタンクリック（MESSAGE_COMPONENT）
  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id || ''
    
    // シフトボタンの処理
    if (customId.startsWith('shift_')) {
      return await handleShiftButtonClick(interaction)
    }
  }
  
  return new Response(
    JSON.stringify({ error: 'Unknown interaction type' }),
    { status: 400, headers: corsHeaders }
  )
})

