// @ts-nocheck
// 戦塵貸切: 予約専用 OAuth で本人を特定し、該当チャンネルに本人権限だけ付ける。ロールは付けない。
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, getAnonKey, getServiceRoleKey } from '../_shared/security.ts'
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

function htmlPage(origin, join) {
  const anon = getAnonKey()
  const redirectUri = `${origin}/functions/v1/senshin-discord-join`
  const boot = join
    ? { reservationId: join.reservationId, kind: join.kind }
    : null
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>戦塵 Discord</title></head>
<body style="font-family:sans-serif;max-width:40rem;margin:2rem auto;line-height:1.6">
<p id="msg">Discordで確認しています…</p>
<script>
const CLIENT_ID = ${JSON.stringify(CLIENT_ID)};
const REDIRECT = ${JSON.stringify(redirectUri)};
const FN = ${JSON.stringify(redirectUri)};
const ANON = ${JSON.stringify(anon)};
const BOOT = ${JSON.stringify(boot)};
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
const msg = document.getElementById('msg');

function parseState(raw) {
  const text = String(raw || '');
  const cut = text.lastIndexOf(':');
  if (cut <= 0) return null;
  const reservationId = text.slice(0, cut);
  const kind = text.slice(cut + 1);
  if (!reservationId || (kind !== 'player' && kind !== 'spectator')) return null;
  return { reservationId, kind };
}

const join = parseState(hash.get('state')) || (
  query.get('reservation') && (query.get('kind') === 'spectator' || query.get('kind') === 'player')
    ? { reservationId: query.get('reservation'), kind: query.get('kind') }
    : BOOT
);
const token = hash.get('access_token');

function oauth() {
  if (!join) {
    msg.textContent = 'リンクが正しくありません。メールの案内から開き直してください。';
    return;
  }
  const u = new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('redirect_uri', REDIRECT);
  u.searchParams.set('response_type', 'token');
  u.searchParams.set('scope', 'identify');
  u.searchParams.set('state', join.reservationId + ':' + join.kind);
  location.replace(u.toString());
}

async function requestGrant() {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON },
    body: JSON.stringify({
      accessToken: token,
      reservationId: join.reservationId,
      kind: join.kind,
    }),
  });
  return res.json().catch(() => ({}));
}

async function grant() {
  if (!join || !token) {
    msg.textContent = 'Discord認証に失敗しました。メールの案内から開き直してください。';
    return;
  }
  const data = await requestGrant();
  if (data.ok && data.channelUrl) {
    msg.textContent = 'チャンネルを開きます';
    location.replace(data.channelUrl);
    return;
  }
  if (data.needJoin && data.inviteUrl) {
    msg.innerHTML = 'サーバーへ参加したあと、自動でチャンネルに入ります。<br><a id="inv" href="#" target="_blank" rel="noopener">サーバーに参加する</a>';
    document.getElementById('inv').href = data.inviteUrl;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 120000) {
        clearInterval(timer);
        msg.textContent = '参加を確認できませんでした。サーバーに入ったあと、メールの案内をもう一度開いてください。';
        return;
      }
      const d2 = await requestGrant();
      if (d2.ok && d2.channelUrl) {
        clearInterval(timer);
        location.replace(d2.channelUrl);
      }
    }, 2000);
    return;
  }
  msg.textContent = data.error || '付与に失敗しました';
}

if (!token) oauth();
else grant();
</script>
</body></html>`
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
    `${url}/rest/v1/private_booking_discord_rooms?reservation_id=eq.${reservationId}&select=reservation_id,player_channel_id,spectator_channel_id,player_invite_url,spectator_invite_url`,
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
  const origin = new URL(req.url).origin
  const cors = { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const join = parseJoin(url.searchParams.get('reservation'), url.searchParams.get('kind') || 'player')
    return new Response(htmlPage(origin, join), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method' }), { status: 405, headers: cors })
  }

  const body = await req.json().catch(() => ({}))
  const join = parseJoin(body.reservationId, body.kind)
  const accessToken = String(body.accessToken || '')
  const token = botToken()
  if (!join) {
    return new Response(JSON.stringify({ error: 'リンクが正しくありません' }), { status: 400, headers: cors })
  }
  if (!token) {
    return new Response(JSON.stringify({ error: 'bot token missing' }), { status: 500, headers: cors })
  }
  const me = await discordMe(accessToken)
  if (!me?.id) {
    return new Response(JSON.stringify({ error: 'Discord認証に失敗しました' }), { status: 401, headers: cors })
  }

  let room
  try {
    room = await loadRoom(join.reservationId)
  } catch {
    return new Response(JSON.stringify({ error: '予約の確認に失敗しました' }), { status: 500, headers: cors })
  }
  if (!room) {
    return new Response(JSON.stringify({ error: 'この予約のDiscord案内が見つかりません' }), { status: 404, headers: cors })
  }

  const channelId = join.kind === 'spectator' ? room.spectator_channel_id : room.player_channel_id
  const inviteUrl = join.kind === 'spectator' ? room.spectator_invite_url : room.player_invite_url
  if (!channelId) {
    return new Response(JSON.stringify({ error: 'この予約のDiscord案内が見つかりません' }), { status: 404, headers: cors })
  }

  const inGuild = await memberExists(token, me.id)
  if (!inGuild) {
    return new Response(
      JSON.stringify({ needJoin: true, inviteUrl: inviteUrl || '' }),
      { headers: cors },
    )
  }

  const ok = await addToChannel(token, me.id, channelId)
  if (!ok) {
    return new Response(JSON.stringify({ error: 'チャンネルに入れませんでした' }), { status: 500, headers: cors })
  }
  return new Response(
    JSON.stringify({
      ok: true,
      channelUrl: `https://discord.com/channels/${SENSHIN_DISCORD.guildId}/${channelId}`,
    }),
    { headers: cors },
  )
})
