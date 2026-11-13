// 検証環境（ステージング）から外部へ送らないための判定（#1281）。
// Deno に依存しない純粋な判定だけを置き、vitest から確かめられるようにする。
// 実際の fetch への差し込みは outbound-guard.ts が行う。

/** ステージングの Supabase プロジェクト。環境変数の設定漏れがあってもここで止める。 */
export const STAGING_PROJECT_REF = 'lavutzztfqbdndjiwluc'

/** 検証環境から送ってよいメールの宛先（伏せた宛先）。 */
export const MASKED_EMAIL_DOMAIN = 'example.invalid'

export interface OutboundGuardEnv {
  appEnv?: string | null
  supabaseUrl?: string | null
  /** 検証環境でも送ってよいメールアドレス（カンマ区切り、完全一致）。 */
  emailAllowlist?: string | null
  /** 検証環境でも書き込んでよい Discord のチャンネル・Webhook の ID（カンマ区切り）。 */
  discordAllowlist?: string | null
  /** Discord のアプリ ID。ボタン操作への返信（interaction の webhook）だけは通す。 */
  discordApplicationId?: string | null
}

export function isStagingEnvironment(env: OutboundGuardEnv): boolean {
  const url = (env.supabaseUrl || '').toLowerCase()
  if (url.includes(STAGING_PROJECT_REF)) return true
  const appEnv = (env.appEnv || '').toLowerCase()
  return appEnv === 'staging' || appEnv === 'stage'
}

function splitList(value?: string | null): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function emailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/)
  return (match ? match[1] : value).trim().toLowerCase()
}

function recipientsOf(message: unknown): string[] {
  if (!message || typeof message !== 'object') return []
  const record = message as Record<string, unknown>
  const out: string[] = []
  for (const key of ['to', 'cc', 'bcc']) {
    const value = record[key]
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === 'string'))
  }
  return out.map(emailAddress)
}

// 伏せた宛先（@example.invalid）へも実際には送らない。存在しない宛先への送信は宛先不明で戻り、
// 本番と共通の送り元（mmq.game）の評判を下げる（2026-11、約230通が戻り Microsoft 系で遅延が出た）。
// 検証環境から実際に届けてよいのは STAGING_EMAIL_ALLOWLIST のアドレスだけ。
export function isAllowedStagingEmail(address: string, env: OutboundGuardEnv): boolean {
  return splitList(env.emailAllowlist).has(emailAddress(address))
}

export type OutboundDecision =
  | { action: 'allow' }
  | { action: 'block'; channel: 'email' | 'discord' | 'x'; reason: string; batch?: number }

const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'])
const X_HOSTS = new Set(['api.twitter.com', 'api.x.com', 'upload.twitter.com'])

/**
 * 検証環境での外部送信を判定する。本番では常に allow。
 * - Resend: 宛先（to/cc/bcc）が伏せたアドレスか許可リストのものだけなら送る。1件でも実在の宛先があれば送らない。
 * - Discord: 読み取り（GET）と、ボタン操作への返信だけ通す。書き込みは許可リストの ID を含む場合だけ。
 * - X: 書き込みは送らない。
 */
export function decideOutbound(
  input: { url: string; method?: string; body?: string | null },
  env: OutboundGuardEnv,
): OutboundDecision {
  if (!isStagingEnvironment(env)) return { action: 'allow' }

  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    return { action: 'allow' }
  }
  const host = parsed.hostname.toLowerCase()
  const method = (input.method || 'GET').toUpperCase()

  if (host === 'api.resend.com') {
    if (method === 'GET' || !parsed.pathname.startsWith('/emails')) return { action: 'allow' }
    let payload: unknown
    try {
      payload = JSON.parse(input.body || 'null')
    } catch {
      return { action: 'block', channel: 'email', reason: 'unreadable_body' }
    }
    const messages = Array.isArray(payload) ? payload : [payload]
    const recipients = messages.flatMap(recipientsOf)
    if (recipients.length > 0 && recipients.every(address => isAllowedStagingEmail(address, env))) {
      return { action: 'allow' }
    }
    return {
      action: 'block',
      channel: 'email',
      reason: 'real_recipient_from_staging',
      batch: Array.isArray(payload) ? payload.length : undefined,
    }
  }

  if (DISCORD_HOSTS.has(host)) {
    const path = parsed.pathname
    // 止めた作成で返した仮の ID（0）への後続の操作は、読み取りも含めて本物へ送らず仮の応答を返す
    if (/\/(channels|guilds|roles|messages|webhooks|invites)\/0(\/|$)/.test(path)) {
      return { action: 'block', channel: 'discord', reason: 'staging_placeholder_id' }
    }
    if (method === 'GET' || method === 'HEAD') return { action: 'allow' }
    if (/\/interactions\/\d+\/[^/]+\/callback/.test(path)) return { action: 'allow' }
    if (path.endsWith('/oauth2/token')) return { action: 'allow' }
    // ボタン操作への返信（/webhooks/{アプリID}/{interaction token}/...）。interaction token は
    // 「interaction:」の base64（aW50ZXJhY3Rpb24）で始まるので、環境変数が無くても見分けられる。
    if (/\/webhooks\/\d+\/aW50ZXJhY3Rpb24/.test(path)) return { action: 'allow' }
    const appId = (env.discordApplicationId || '').trim()
    if (appId && path.includes(`/webhooks/${appId}/`)) return { action: 'allow' }
    const allowed = splitList(env.discordAllowlist)
    const ids = path.match(/\d{15,}/g) || []
    if (ids.some(id => allowed.has(id))) return { action: 'allow' }
    return { action: 'block', channel: 'discord', reason: 'discord_write_from_staging' }
  }

  if (X_HOSTS.has(host)) {
    if (method === 'GET') return { action: 'allow' }
    return { action: 'block', channel: 'x', reason: 'x_write_from_staging' }
  }

  return { action: 'allow' }
}

/** 止めた送信の代わりに返す応答。呼び出し側が「送れた」とみなして先へ進めるよう、各サービスの成功の形に寄せる。 */
export function blockedResponseBody(decision: Extract<OutboundDecision, { action: 'block' }>): Record<string, unknown> {
  const id = `staging-blocked-${Date.now()}`
  if (decision.channel === 'email' && decision.batch !== undefined) {
    return { data: Array.from({ length: decision.batch }, (_, i) => ({ id: `${id}-${i}` })) }
  }
  if (decision.channel === 'x') return { data: { id, text: '' } }
  if (decision.channel === 'discord') {
    // チャンネル・ロール・招待・メッセージの作成で呼び出し側が読む項目をそろえる（招待は code が必須）
    return { id: '0', code: 'staging-blocked', channel_id: '0', name: 'staging-blocked', type: 0, content: '', permission_overwrites: [] }
  }
  return { id }
}

/**
 * 検証環境から Resend へ送るときの重複防止キー。本番と同じ送信 ID を持つ写しの行が同じキーを使うと、
 * 24 時間は本番の送信が 409 で弾かれ、お客様へ届かない（2026-11-13、貸切お断り 9 件で発生）。
 * 検証環境のキーには前置きを付けて、本番のキーと重ならないようにする。
 */
export const STAGING_IDEMPOTENCY_PREFIX = 'mmq-staging/'
export function stagingIdempotencyKey(key: string): string {
  return key.startsWith(STAGING_IDEMPOTENCY_PREFIX) ? key : `${STAGING_IDEMPOTENCY_PREFIX}${key}`
}

/**
 * 検証環境から送ったメールの目印。Resend のアカウントと Webhook は本番と共通なので、
 * 検証環境の送信の配信イベントも本番の resend-webhook に届き、本番の送信ログ（email_logs）に
 * 書かれていた（2026-11、伏せた宛先の bounced / delivery_delayed が本番の画面に出た）。
 * 検証環境の送信にこのタグを付け、本番の Webhook はタグか伏せた宛先で見分けて書かない。
 */
export const STAGING_EMAIL_TAG = { name: 'mmq_env', value: 'staging' } as const

function withStagingTag(message: unknown): unknown {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return message
  const record = message as Record<string, unknown>
  const tags = Array.isArray(record.tags) ? record.tags.filter(t => !(t && typeof t === 'object' && (t as { name?: unknown }).name === STAGING_EMAIL_TAG.name)) : []
  return { ...record, tags: [...tags, { ...STAGING_EMAIL_TAG }] }
}

/** Resend /emails（まとめ送信も）の本文に検証環境の目印タグを足す。読めない本文はそのまま返す。 */
export function tagStagingEmailBody(body: string | null): string | null {
  if (body === null) return null
  try {
    const payload = JSON.parse(body)
    return JSON.stringify(Array.isArray(payload) ? payload.map(withStagingTag) : withStagingTag(payload))
  } catch {
    return body
  }
}

/** Webhook のイベントが検証環境の送信のものか（目印タグがある、または宛先が全部伏せたアドレス）。 */
export function isStagingEmailEvent(data: { to?: unknown; tags?: unknown } | null | undefined): boolean {
  if (!data) return false
  const tags = data.tags
  if (Array.isArray(tags) && tags.some(t => t && typeof t === 'object' && (t as { name?: unknown }).name === STAGING_EMAIL_TAG.name && (t as { value?: unknown }).value === STAGING_EMAIL_TAG.value)) return true
  if (tags && typeof tags === 'object' && !Array.isArray(tags) && (tags as Record<string, unknown>)[STAGING_EMAIL_TAG.name] === STAGING_EMAIL_TAG.value) return true
  const to = Array.isArray(data.to) ? data.to : typeof data.to === 'string' ? [data.to] : []
  const addresses = to.map(a => String(a).trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1')).filter(Boolean)
  return addresses.length > 0 && addresses.every(a => a.endsWith(`@${MASKED_EMAIL_DOMAIN}`))
}

/** メール送信 1 通ごとにあける間隔（本番・検証環境とも）。溜まった分を一気に流さない。 */
export const EMAIL_SEND_GAP_MS = 1500

/** Resend のメール送信（単発・まとめ送信）の URL か。 */
export function isResendSendUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.toLowerCase() === 'api.resend.com' && /^\/emails(\/batch)?\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}
