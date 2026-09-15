// @ts-nocheck
// 戦塵貸切: 予約専用 OAuth で本人を特定し、該当チャンネルに本人権限だけ付ける。ロールは付けない。
// Supabase 共有ドメインは HTML を text/plain にするので、ページは出さず 302 だけ使う。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, getServiceRoleKey } from '../_shared/security.ts'
import { CHANNEL_VIEW, SENSHIN_DISCORD } from '../_shared/senshin-discord.ts'

const CLIENT_ID = '1532875462244831302'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function botToken() {
  return (
    Deno.env.get('DISCORD_SENSHIN_BOT_TOKEN') ||
    Deno.env.get('DISCORD_BOT_TOKEN') ||
    ''
  ).trim()
}

function clientSecret() {
  return (Deno.env.get('DISCORD_SENSHIN_OAUTH_CLIENT_SECRET') || '').trim()
}

function publicOrigin(req) {
  const fromEnv = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  if (fromEnv.startsWith('https://')) return fromEnv
  const host = req.headers.get('x-forwarded-host') || new URL(req.url).host
  return `https://${host}`
}

function redirectUri(origin) {
  return `${origin}/functions/v1/senshin-discord-join`
}

function parseJoin(reservationRaw, kindRaw) {
  const reservationId = String(reservationRaw || '').trim().toLowerCase()
  const kind = kindRaw === 'spectator' ? 'spectator' : kindRaw === 'player' ? 'player' : ''
  if (!UUID_RE.test(reservationId) || !kind) return null
  return { reservationId, kind }
}

function parseState(raw) {
  const text = String(raw || '')
  const cut = text.lastIndexOf(':')
  if (cut <= 0) return null
  return parseJoin(text.slice(0, cut), text.slice(cut + 1))
}

function text(status, body) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } })
}

function authorizeUrl(origin, join) {
  const u = new URL('https://discord.com/oauth2/authorize')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('redirect_uri', redirectUri(origin))
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'identify')
  u.searchParams.set('state', `${join.reservationId}:${join.kind}`)
  return u.toString()
}

async function exchangeCode(code, origin) {
  const secret = clientSecret()
  if (!secret) return null
  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(origin),
    }),
  })
  if (!res.ok) return null
  return await res.json()
}

async function discordMe(accessToken) {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return await res.json()
}

async function memberExists(token, userId) {
  const res = await fetch(`https://discord.com/api/v10/guilds/${SENSHIN_DISCORD.guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${token}`, 'User-Agent': 'DiscordBot (https://mmq.game, 1.0)' },
  })
  return res.ok
}

async function loadRoom(reservationId) {
  const url = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const key = getServiceRoleKey()
  const res = await fetch(
    `${url}/rest/v1/private_booking_discord_rooms?reservation_id=eq.${encodeURIComponent(reservationId)}&select=reservation_id,player_channel_id,spectator_channel_id,player_invite_url,spectator_invite_url`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  )
  if (!res.ok) throw new Error(`rooms ${res.status}`)
  const rows = await res.json()
  return rows?.[0] || null
}

async function addToChannel(token, userId, channelId) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'DiscordBot (https://mmq.game, 1.0)',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 1, allow: String(CHANNEL_VIEW), deny: '0' }),
    },
  )
  return res.ok || res.status === 204
}

serve(async (req) => {
  const origin = publicOrigin(req)
  const cors = { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return text(405, 'method')

  const url = new URL(req.url)
  if (url.searchParams.get('error')) {
    return text(400, 'Discord認証がキャンセルされました。メールの案内から開き直してください。')
  }

  const code = (url.searchParams.get('code') || '').trim()
  const join = parseState(url.searchParams.get('state'))
    || parseJoin(url.searchParams.get('reservation'), url.searchParams.get('kind') || 'player')

  if (!code) {
    if (!join) return text(400, 'リンクが正しくありません。メールの案内から開き直してください。')
    return redirect(authorizeUrl(origin, join))
  }

  if (!join) return text(400, 'リンクが正しくありません。メールの案内から開き直してください。')
  if (!clientSecret()) {
    return text(500, 'OAuthの設定が未完了です。')
  }

  const exchanged = await exchangeCode(code, origin)
  const accessToken = exchanged?.access_token
  if (!accessToken) return text(401, 'Discord認証に失敗しました。メールの案内から開き直してください。')

  const token = botToken()
  if (!token) return text(500, 'bot token missing')

  const me = await discordMe(accessToken)
  if (!me?.id) return text(401, 'Discord認証に失敗しました。メールの案内から開き直してください。')

  let room
  try {
    room = await loadRoom(join.reservationId)
  } catch {
    return text(500, '予約の確認に失敗しました。')
  }
  if (!room) return text(404, 'この予約のDiscord案内が見つかりません。')

  const channelId = join.kind === 'spectator' ? room.spectator_channel_id : room.player_channel_id
  const inviteUrl = join.kind === 'spectator' ? room.spectator_invite_url : room.player_invite_url
  if (!channelId) return text(404, 'この予約のDiscord案内が見つかりません。')

  const inGuild = await memberExists(token, me.id)
  if (!inGuild) {
    if (!inviteUrl) return text(404, '参加用URLが見つかりません。サーバーに入ったあと、メールの案内をもう一度開いてください。')
    return redirect(inviteUrl)
  }

  const ok = await addToChannel(token, me.id, channelId)
  if (!ok) return text(500, 'チャンネルに入れませんでした。')
  return redirect(`https://discord.com/channels/${SENSHIN_DISCORD.guildId}/${channelId}`)
})
