// @ts-nocheck
// スタッフ操作で担当が外れたGMへ Discord 通知する
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import {
  errorResponse,
  getCorsHeaders,
  getServiceRoleKey,
  isCronOrServiceRoleCall,
  verifyAuth,
} from '../_shared/security.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = getServiceRoleKey()
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function postDiscordChannelMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (response.ok) return true
  const errorText = await response.text()
  console.error('Discord API メッセージ送信失敗:', channelId, errorText)
  return false
}

async function createDiscordDmChannel(botToken: string, recipientUserId: string): Promise<string | null> {
  const response = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: recipientUserId }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Discord DMチャンネル作成失敗:', recipientUserId, errorText)
    return null
  }
  const data = await response.json()
  return data?.id || null
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!isCronOrServiceRoleCall(req)) {
      const authResult = await verifyAuth(req, undefined, { allowAnonymous: true })
      if (!authResult.success) {
        return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
      }
    }

    const payload = await req.json()
    const organizationId = typeof payload.organizationId === 'string' ? payload.organizationId.trim() : ''
    const body = typeof payload.body === 'string' ? payload.body.trim() : ''
    const gms = Array.isArray(payload.gms)
      ? payload.gms.map((name) => String(name || '').trim()).filter(Boolean)
      : []

    if (!organizationId || !body || gms.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'nothing to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: staffRows, error: staffError } = await supabase
      .from('staff')
      .select('id, name, discord_channel_id, discord_user_id')
      .in('name', gms)
      .eq('organization_id', organizationId)
      .eq('status', 'active')

    if (staffError) {
      console.error('staff fetch error:', staffError)
      return errorResponse('Failed to fetch staff', 500, corsHeaders)
    }

    const discordSettings = await getDiscordSettings(supabase, organizationId)
    const botToken = discordSettings?.botToken || Deno.env.get('DISCORD_BOT_TOKEN')
    const fallbackChannel = (discordSettings?.privateBookingChannelId || '').trim()

    if (!botToken) {
      console.warn('DISCORD_BOT_TOKEN 未設定のためGM解除通知をスキップ')
      return new Response(JSON.stringify({ success: true, skipped: 'no_bot_token' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.allSettled((staffRows || []).map(async (staff) => {
      const mention = staff.discord_user_id ? `<@${staff.discord_user_id}>` : ''
      const content = mention ? `${mention}\n${body}` : body
      const message = { content }
      const personalCh = (staff.discord_channel_id || '').trim()

      if (personalCh && await postDiscordChannelMessage(botToken, personalCh, message)) {
        return { name: staff.name, method: 'personal_channel' }
      }

      if (staff.discord_user_id) {
        const dmId = await createDiscordDmChannel(botToken, staff.discord_user_id)
        if (dmId && await postDiscordChannelMessage(botToken, dmId, message)) {
          return { name: staff.name, method: 'dm' }
        }
      }

      if (fallbackChannel && await postDiscordChannelMessage(botToken, fallbackChannel, message)) {
        return { name: staff.name, method: 'fallback' }
      }

      throw new Error(`no discord destination for ${staff.name}`)
    }))

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    return new Response(JSON.stringify({ success: true, sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('notify-gm-assignment-released error:', error)
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500, corsHeaders)
  }
})
