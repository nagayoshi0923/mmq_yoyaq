// @ts-nocheck
// 貸切予約キャンセル時にGMにDiscord通知を送信
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import { errorResponse, getCorsHeaders, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const FALLBACK_DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function isSystemCall(req: Request): boolean {
  return isCronOrServiceRoleCall(req)
}

// 曜日を取得するヘルパー関数
function getDayOfWeek(dateString: string): string {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const date = new Date(dateString + 'T00:00:00+09:00')
  return days[date.getDay()]
}

// 日付をフォーマット
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00+09:00')
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayOfWeek = getDayOfWeek(dateString)
  return `${month}/${day}(${dayOfWeek})`
}

// Discord通知をキューに積む
async function enqueueDiscordNotification(
  channelId: string,
  params: {
    customerName: string
    scenarioTitle: string
    eventDate: string
    startTime: string
    endTime: string
    storeName: string
    cancellationReason: string
    gmNames: string[]
    userIds: string[]
  },
  orgId: string | null
) {
  if (!channelId || channelId.trim() === '') {
    throw new Error('Discord channel ID is not set')
  }

  const formattedDate = formatDate(params.eventDate)
  const startTimeShort = (params.startTime || '').substring(0, 5)
  const endTimeShort = (params.endTime || '').substring(0, 5)

  // メンション文字列を生成
  const mentionText = params.userIds.length > 0
    ? params.userIds.map(id => `<@${id}>`).join(' ')
    : ''

  const embed = {
    title: '❌ 貸切予約がキャンセルされました',
    color: 0xDC2626, // 赤色
    fields: [
      {
        name: '📅 日時',
        value: `${formattedDate} ${startTimeShort}〜${endTimeShort}`,
        inline: true
      },
      {
        name: '🏠 店舗',
        value: params.storeName,
        inline: true
      },
      {
        name: '🎭 シナリオ',
        value: params.scenarioTitle || 'シナリオ未定',
        inline: false
      },
      {
        name: '👤 お客様',
        value: params.customerName,
        inline: true
      },
      {
        name: '📝 キャンセル理由',
        value: params.cancellationReason || 'お客様のご都合によるキャンセル',
        inline: false
      }
    ],
    footer: {
      text: '担当予定だった公演がキャンセルされました'
    },
    timestamp: new Date().toISOString()
  }

  const payload = {
    content: mentionText ? `${mentionText}\n**貸切予約がキャンセルされました**` : '**貸切予約がキャンセルされました**',
    embeds: [embed]
  }

  // キューに積む
  const { error: queueError } = await supabase
    .from('discord_notification_queue')
    .insert({
      channel_id: channelId,
      payload: payload,
      organization_id: orgId,
      status: 'pending',
      created_at: new Date().toISOString()
    })

  if (queueError) {
    console.error('❌ Failed to queue notification:', queueError)
    throw queueError
  }

  console.log(`✅ Notification queued for channel ${channelId}`)
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 認証チェック（サービスロールまたは内部呼び出しのみ許可）
    if (!isSystemCall(req)) {
      console.warn('⚠️ Unauthorized call attempt')
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    const body = await req.json()
    console.log('📥 Received cancellation notification request:', JSON.stringify(body, null, 2))

    const {
      organizationId,
      scheduleEventId,
      gms,
      customerName,
      scenarioTitle,
      eventDate,
      startTime,
      endTime,
      storeName,
      storeId,
      cancellationReason
    } = body

    if (!gms || gms.length === 0) {
      console.log('⚠️ No GMs specified for notification')
      return new Response(JSON.stringify({ success: true, message: 'No GMs to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`📋 Notifying GMs: ${gms.join(', ')}`)

    // GMの名前からスタッフ情報を取得
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, name, discord_channel_id, discord_user_id')
      .in('name', gms)
      .eq('status', 'active')

    if (staffError) {
      console.error('❌ Error fetching staff:', staffError)
      return errorResponse('Failed to fetch staff data', 500, corsHeaders)
    }

    if (!staffData || staffData.length === 0) {
      console.log('⚠️ No matching staff found for GMs:', gms)
      return new Response(JSON.stringify({ success: true, message: 'No matching staff found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Discordチャンネルがあるスタッフのみフィルタ
    const staffWithDiscord = staffData.filter(s => s.discord_channel_id)
    
    if (staffWithDiscord.length === 0) {
      console.log('⚠️ No GMs with Discord channels found')
      return new Response(JSON.stringify({ success: true, message: 'No GMs with Discord channels' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`📋 Found ${staffWithDiscord.length} GM(s) with Discord channels`)

    // チャンネルIDの重複を除外
    const uniqueChannels = new Map<string, { channelId: string, gmNames: string[], userIds: string[] }>()
    staffWithDiscord.forEach(gm => {
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

    console.log(`📋 Unique channels to notify: ${uniqueChannels.size}`)

    // 各チャンネルに通知をキュー
    const notificationPromises = Array.from(uniqueChannels.values()).map(async ({ channelId, gmNames, userIds }) => {
      console.log(`📥 Queuing notification to channel ${channelId} (GMs: ${gmNames.join(', ')})`)
      return enqueueDiscordNotification(channelId, {
        customerName,
        scenarioTitle,
        eventDate,
        startTime,
        endTime,
        storeName,
        cancellationReason,
        gmNames,
        userIds
      }, organizationId)
    })

    const results = await Promise.allSettled(notificationPromises)

    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.filter(r => r.status === 'rejected').length

    console.log(`✅ Queued ${successCount} notifications, ${failCount} failed`)

    return new Response(JSON.stringify({
      success: true,
      queued: successCount,
      failed: failCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Error processing request:', error)
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, corsHeaders)
  }
})
