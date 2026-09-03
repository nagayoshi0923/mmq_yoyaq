// 戦塵貸切: 新規参加を見て、該当チャンネルに本人権限だけ付ける。ロールは付けない。
import http from 'node:http'
import WebSocket from 'ws'

const GUILD = '1466422091598266380'
const GM_ALERT_CHANNEL = '1478783425010995404'
const CHANNEL_VIEW = String(1024 + 2048 + 65536)
const INTENTS = 1 | 2 | 64
const PORT = Number(process.env.PORT || 8080)
const MAP_REFRESH_MS = 5 * 60 * 1000
const JOIN_WINDOW_MS = 2500

function requireEnv(name) {
  const v = (process.env[name] || '').trim()
  if (!v) throw new Error(`${name} が未設定です`)
  return v
}

const botToken = requireEnv('DISCORD_SENSHIN_BOT_TOKEN')
const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/$/, '')
const supabaseKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

function rest(method, path, body) {
  return fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${botToken}`,
      'User-Agent': 'DiscordBot (https://mmq.game, 1.0)',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function inviteUses() {
  const res = await rest('GET', `/guilds/${GUILD}/invites`)
  if (!res.ok) throw new Error(`invites ${res.status}`)
  const invites = await res.json()
  return Object.fromEntries((invites || []).map((i) => [i.code, i.uses || 0]))
}

function codeFromUrl(url) {
  const raw = String(url || '').trim()
  if (!raw.startsWith('https://discord.gg/')) return ''
  return raw.split('/').pop() || ''
}

async function loadMap() {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/private_booking_discord_rooms?select=reservation_id,player_channel_id,spectator_channel_id,player_invite_url,spectator_invite_url`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    },
  )
  if (!res.ok) throw new Error(`rooms ${res.status}`)
  const data = await res.json()
  const out = {}
  for (const row of data || []) {
    const p = codeFromUrl(row.player_invite_url)
    const s = codeFromUrl(row.spectator_invite_url)
    if (p) out[p] = { channelId: row.player_channel_id, label: `${row.reservation_id} player` }
    if (s) out[s] = { channelId: row.spectator_channel_id, label: `${row.reservation_id} spectator` }
  }
  return out
}

async function addToChannel(userId, channelId, label) {
  const res = await rest('PUT', `/channels/${channelId}/permissions/${userId}`, {
    type: 1,
    allow: CHANNEL_VIEW,
    deny: '0',
  })
  console.log(`channel ${label} user=${userId} status=${res.status}`)
}

async function alertGm(text) {
  const res = await rest('POST', `/channels/${GM_ALERT_CHANNEL}/messages`, { content: text.slice(0, 1800) })
  console.log(`gm alert status=${res.status}`)
}

http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok\n')
}).listen(PORT, () => console.log(`health :${PORT}`))

async function gatewayLoop() {
  let mapping = await loadMap()
  let uses = await inviteUses()
  let pending = []
  let flushTimer = null
  console.log(`watching ${Object.keys(mapping).length} invites`)
  setInterval(() => {
    loadMap()
      .then((next) => {
        mapping = next
        console.log(`map refreshed ${Object.keys(mapping).length}`)
      })
      .catch((e) => console.error('map refresh failed', e.message))
  }, MAP_REFRESH_MS)

  async function flushJoins() {
    flushTimer = null
    const batch = pending
    pending = []
    if (batch.length === 0) return
    try {
      await new Promise((r) => setTimeout(r, 1200))
      const now = await inviteUses()
      const bumped = []
      for (const [code, dest] of Object.entries(mapping)) {
        const delta = (now[code] || 0) - (uses[code] || 0)
        if (delta > 0) bumped.push({ code, dest, delta })
      }
      uses = now
      if (bumped.length === 1) {
        const dest = bumped[0].dest
        for (const p of batch) {
          await addToChannel(p.uid, dest.channelId, dest.label)
        }
      } else if (bumped.length === 0) {
        console.log('join but no matching invite increment', batch.map((b) => b.name).join(','))
      } else {
        const names = batch.map((b) => `${b.name} (${b.uid})`).join(', ')
        const codes = bumped.map((b) => `${b.dest.label} ${b.code} +${b.delta}`).join(', ')
        console.log('ambiguous joins', names, codes)
        await alertGm(
          `同時入室で自動付与を見送りました。\n入室: ${names}\n増えた招待: ${codes}\n管理画面の参加方法を見てチャンネル権限を付けてください。`,
        )
      }
    } catch (e) {
      console.error('flush joins failed', e.message)
    } finally {
      if (pending.length && !flushTimer) {
        flushTimer = setTimeout(() => {
          flushJoins().catch((e) => console.error(e))
        }, JOIN_WINDOW_MS)
      }
    }
  }

  for (;;) {
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')
        let seq = null
        let heartbeat = null
        let identified = false

        ws.on('error', reject)
        ws.on('close', () => {
          if (heartbeat) clearInterval(heartbeat)
          resolve()
        })
        ws.on('message', async (raw) => {
          const ev = JSON.parse(String(raw))
          if (ev.s != null) seq = ev.s
          if (ev.op === 10) {
            const interval = ev.d.heartbeat_interval
            heartbeat = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: seq }))
            }, interval)
            ws.send(JSON.stringify({
              op: 2,
              d: {
                token: botToken,
                intents: INTENTS,
                properties: { os: 'linux', browser: 'mmq', device: 'mmq' },
              },
            }))
          } else if (ev.t === 'READY') {
            identified = true
            console.log('ready', ev.d.user.username)
          } else if (ev.t === 'GUILD_MEMBER_ADD' && ev.d?.guild_id === GUILD) {
            const uid = ev.d.user.id
            const name = ev.d.user.global_name || ev.d.user.username
            console.log('join', name, uid)
            pending.push({ uid, name })
            if (!flushTimer) {
              flushTimer = setTimeout(() => {
                flushJoins().catch((e) => console.error(e))
              }, JOIN_WINDOW_MS)
            }
          }
        })
        setTimeout(() => {
          if (!identified) {
            try { ws.close() } catch {}
            reject(new Error('identify timeout'))
          }
        }, 20000)
      })
    } catch (e) {
      console.error('gateway error', e.message)
    }
    await new Promise((r) => setTimeout(r, 3000))
    console.log('reconnect')
  }
}

gatewayLoop().catch((e) => {
  console.error(e)
  process.exit(1)
})
