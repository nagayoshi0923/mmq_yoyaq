// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getDiscordSettings } from '../_shared/organization-settings.ts'
import {
  errorResponse,
  getCorsHeaders,
  getServiceRoleKey,
  isCronOrServiceRoleCall,
  sanitizeErrorMessage,
  verifyAuth,
} from '../_shared/security.ts'
import {
  SENSHIN_DISCORD,
  buildSenshinChannelNames,
  gmMemberOverwrite,
  isSenshinScenario,
  playerChannelOverwrites,
  spectatorChannelOverwrites,
} from '../_shared/senshin-discord.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', getServiceRoleKey())

const CATEGORY_WARN_AT = 40

function discordHeaders(token: string) {
  return {
    Authorization: `Bot ${token}`,
    'User-Agent': 'DiscordBot (https://mmq.game, 1.0)',
    'Content-Type': 'application/json',
  }
}

async function discordJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...discordHeaders(token), ...(init?.headers || {}) },
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'message' in body ? String((body as { message: string }).message) : text
    throw new Error(`Discord ${res.status}: ${msg}`)
  }
  return body
}

async function getBotToken(organizationId: string | null): Promise<string> {
  const dedicated = (Deno.env.get('DISCORD_SENSHIN_BOT_TOKEN') || '').trim()
  if (dedicated) return dedicated
  if (organizationId) {
    const settings = await getDiscordSettings(supabase, organizationId)
    if (settings?.botToken) return settings.botToken
  }
  const fallback = (Deno.env.get('DISCORD_BOT_TOKEN') || '').trim()
  if (fallback) return fallback
  throw new Error('Discord Bot Token が未設定です')
}

async function countCategoryChildren(token: string, categoryId: string): Promise<number> {
  const channels = (await discordJson(
    `https://discord.com/api/v10/guilds/${SENSHIN_DISCORD.guildId}/channels`,
    token,
  )) as Array<{ id: string; parent_id?: string | null }>
  return channels.filter((c) => c.parent_id === categoryId).length
}

async function maybeWarnChannelCap(token: string) {
  const [before, after, spectate, all] = await Promise.all([
    countCategoryChildren(token, SENSHIN_DISCORD.categoryBefore),
    countCategoryChildren(token, SENSHIN_DISCORD.categoryAfter),
    countCategoryChildren(token, SENSHIN_DISCORD.categorySpectate),
    discordJson(`https://discord.com/api/v10/guilds/${SENSHIN_DISCORD.guildId}/channels`, token) as Promise<unknown[]>,
  ])
  const total = Array.isArray(all) ? all.length : 0
  const lines: string[] = []
  if (before >= CATEGORY_WARN_AT) lines.push(`\`開催前\` ${before} / 50`)
  if (after >= CATEGORY_WARN_AT) lines.push(`\`開催終了\` ${after} / 50`)
  if (spectate >= CATEGORY_WARN_AT) lines.push(`\`観戦用\` ${spectate} / 50`)
  if (total >= 450) lines.push(`サーバー全体 ${total} / 500`)
  if (lines.length === 0) return
  await discordJson(
    `https://discord.com/api/v10/channels/${SENSHIN_DISCORD.gmContactChannelId}/messages`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        content: `@everyone チャンネル上限が近づいています。${lines.join('、')}。古い卓の整理を検討してください。`,
        allowed_mentions: { parse: ['everyone'] },
      }),
    },
  )
}

async function createInvite(token: string, channelId: string): Promise<string> {
  const invite = (await discordJson(
    `https://discord.com/api/v10/channels/${channelId}/invites`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ max_age: 0, max_uses: 0, unique: true }),
    },
  )) as { code?: string }
  if (!invite.code) throw new Error('招待コードを発行できませんでした')
  return `https://discord.gg/${invite.code}`
}

async function addGmToChannel(token: string, channelId: string, userId: string) {
  const ow = gmMemberOverwrite(userId)
  await discordJson(
    `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({ type: 1, allow: ow.allow, deny: ow.deny }),
    },
  )
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const isSystem = isCronOrServiceRoleCall(req)
    if (!isSystem) {
      const authResult = await verifyAuth(req)
      if (!authResult.success) {
        return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
      }
    }

    const body = await req.json()
    const reservationId = String(body.reservationId || '')
    const organizationId = body.organizationId ? String(body.organizationId) : null
    const action = body.action === 'finalize' || body.action === 'cancel' ? body.action : 'provision'
    if (!reservationId) {
      return errorResponse('reservationId が必要です', 400, corsHeaders)
    }

    const { data: reservation, error: resErr } = await supabase
      .from('reservations')
      .select('id, organization_id, scenario_master_id, scenario_title, schedule_event_id, store_id, status')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr || !reservation) {
      return errorResponse('予約が見つかりません', 404, corsHeaders)
    }
    if (organizationId && reservation.organization_id !== organizationId) {
      return errorResponse('組織が一致しません', 403, corsHeaders)
    }
    if (!isSenshinScenario(reservation.scenario_master_id, reservation.scenario_title)) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'not_senshin' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: existing } = await supabase
      .from('private_booking_discord_rooms')
      .select('*')
      .eq('reservation_id', reservationId)
      .maybeSingle()

    if (action === 'cancel') {
      if (!existing) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_rooms' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const token = await getBotToken(reservation.organization_id)
      const mark = async (channelId: string) => {
        const ch = (await discordJson(
          `https://discord.com/api/v10/channels/${channelId}`,
          token,
        )) as { name?: string }
        const current = ch.name || ''
        if (current.startsWith('⚠️')) return current
        const next = `⚠️${current}`.slice(0, 100)
        const updated = (await discordJson(
          `https://discord.com/api/v10/channels/${channelId}`,
          token,
          { method: 'PATCH', body: JSON.stringify({ name: next }) },
        )) as { name?: string }
        return updated.name || next
      }
      const playerName = await mark(existing.player_channel_id)
      const spectatorName = await mark(existing.spectator_channel_id)
      await supabase
        .from('private_booking_discord_rooms')
        .update({
          player_channel_name: playerName,
          spectator_channel_name: spectatorName,
        })
        .eq('id', existing.id)
      return new Response(
        JSON.stringify({ success: true, cancelled: true, playerName, spectatorName }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'finalize') {
      if (!existing) {
        return errorResponse('Discordチャンネルがまだありません', 404, corsHeaders)
      }
      const token = await getBotToken(reservation.organization_id)
      if (!existing.moved_at) {
        await discordJson(
          `https://discord.com/api/v10/channels/${existing.player_channel_id}`,
          token,
          {
            method: 'PATCH',
            body: JSON.stringify({ parent_id: SENSHIN_DISCORD.categoryAfter }),
          },
        )
      }
      if (existing.date_role_id) {
        await discordJson(
          `https://discord.com/api/v10/channels/${existing.spectator_channel_id}/permissions/${existing.date_role_id}`,
          token,
          {
            method: 'PUT',
            body: JSON.stringify({ type: 0, allow: String(1024 + 2048 + 65536), deny: '0' }),
          },
        )
        const playerCh = (await discordJson(
          `https://discord.com/api/v10/channels/${existing.player_channel_id}`,
          token,
        )) as { permission_overwrites?: Array<{ id: string; type: number }> }
        for (const ow of playerCh.permission_overwrites || []) {
          if (ow.type !== 1) continue
          await discordJson(
            `https://discord.com/api/v10/guilds/${SENSHIN_DISCORD.guildId}/members/${ow.id}/roles/${existing.date_role_id}`,
            token,
            { method: 'PUT' },
          ).catch((e) => console.warn('date role grant skipped', ow.id, e.message))
        }
      }
      await supabase
        .from('private_booking_discord_rooms')
        .update({ moved_at: new Date().toISOString() })
        .eq('id', existing.id)
      return new Response(
        JSON.stringify({
          success: true,
          finalized: true,
          playerInviteUrl: existing.player_invite_url,
          spectatorInviteUrl: existing.spectator_invite_url,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          reused: true,
          playerInviteUrl: existing.player_invite_url,
          spectatorInviteUrl: existing.spectator_invite_url,
          playerChannelId: existing.player_channel_id,
          spectatorChannelId: existing.spectator_channel_id,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const eventId = reservation.schedule_event_id || body.scheduleEventId || null
    const { data: event } = eventId
      ? await supabase
          .from('schedule_events')
          .select('id, date, start_time, store_id, gms, scenario_master_id')
          .eq('id', eventId)
          .maybeSingle()
      : { data: null }

    if (!event?.date || !event.start_time) {
      return errorResponse('公演日時がありません', 400, corsHeaders)
    }

    const storeId = event.store_id || reservation.store_id
    const { data: store } = storeId
      ? await supabase.from('stores').select('name, short_name').eq('id', storeId).maybeSingle()
      : { data: null }

    const names = buildSenshinChannelNames({
      eventDate: String(event.date),
      startTime: String(event.start_time).slice(0, 5),
      storeName: store?.name,
      storeShortName: store?.short_name,
    })

    const gmNames = Array.isArray(event.gms) ? event.gms.filter(Boolean) : []
    const { data: gmStaff } = gmNames.length
      ? await supabase
          .from('staff')
          .select('name, discord_user_id')
          .eq('organization_id', reservation.organization_id)
          .in('name', gmNames)
      : { data: [] }
    const gmUserIds = [...new Set(
      (gmStaff || [])
        .map((s) => (s.discord_user_id || '').trim())
        .filter((id) => /^\d{15,22}$/.test(id)),
    )]

    const token = await getBotToken(reservation.organization_id)
    const guildId = SENSHIN_DISCORD.guildId

    const role = (await discordJson(
      `https://discord.com/api/v10/guilds/${guildId}/roles`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ name: names.roleName, mentionable: false, hoist: false }),
      },
    )) as { id: string }

    const playerCh = (await discordJson(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          name: names.playerName,
          type: 0,
          parent_id: SENSHIN_DISCORD.categoryBefore,
          permission_overwrites: playerChannelOverwrites(guildId, role.id),
        }),
      },
    )) as { id: string; name: string }

    const spectatorCh = (await discordJson(
      `https://discord.com/api/v10/guilds/${guildId}/channels`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          name: names.spectatorName,
          type: 0,
          parent_id: SENSHIN_DISCORD.categorySpectate,
          permission_overwrites: spectatorChannelOverwrites(guildId),
        }),
      },
    )) as { id: string; name: string }

    for (const uid of gmUserIds) {
      await addGmToChannel(token, playerCh.id, uid).catch((e) => console.warn('GM add player', uid, e.message))
      await addGmToChannel(token, spectatorCh.id, uid).catch((e) => console.warn('GM add spectator', uid, e.message))
    }

    const [playerInviteUrl, spectatorInviteUrl] = await Promise.all([
      createInvite(token, playerCh.id),
      createInvite(token, spectatorCh.id),
    ])

    await discordJson(
      `https://discord.com/api/v10/channels/${playerCh.id}/messages`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ content: 'このチャンネルは**参加者用**です。観戦者は観戦用チャンネルをご利用ください。' }),
      },
    ).catch(() => {})
    await discordJson(
      `https://discord.com/api/v10/channels/${spectatorCh.id}/messages`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ content: 'このチャンネルは**観戦者用**です。参加者チャンネルは見えません。公演終了後、参加者がこちらに入れます。' }),
      },
    ).catch(() => {})

    const { error: insertErr } = await supabase.from('private_booking_discord_rooms').insert({
      organization_id: reservation.organization_id,
      reservation_id: reservation.id,
      schedule_event_id: event.id,
      scenario_master_id: reservation.scenario_master_id,
      player_channel_id: playerCh.id,
      spectator_channel_id: spectatorCh.id,
      player_invite_url: playerInviteUrl,
      spectator_invite_url: spectatorInviteUrl,
      date_role_id: role.id,
      player_channel_name: playerCh.name,
      spectator_channel_name: spectatorCh.name,
    })
    if (insertErr) {
      console.error('rooms insert failed', insertErr)
      throw new Error('チャンネルは作りましたが記録に失敗しました')
    }

    await maybeWarnChannelCap(token).catch((e) => console.warn('cap warn failed', e.message))

    return new Response(
      JSON.stringify({
        success: true,
        playerInviteUrl,
        spectatorInviteUrl,
        playerChannelId: playerCh.id,
        spectatorChannelId: spectatorCh.id,
        roleId: role.id,
        playerChannelName: playerCh.name,
        spectatorChannelName: spectatorCh.name,
        gmAdded: gmUserIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('provision-private-booking-discord', error)
    return errorResponse(sanitizeErrorMessage(error), 500, corsHeaders)
  }
})
