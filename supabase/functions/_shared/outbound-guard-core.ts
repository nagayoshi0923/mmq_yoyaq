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

export function isAllowedStagingEmail(address: string, env: OutboundGuardEnv): boolean {
  const normalized = emailAddress(address)
  if (normalized.endsWith(`@${MASKED_EMAIL_DOMAIN}`)) return true
  return splitList(env.emailAllowlist).has(normalized)
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
    if (method === 'GET' || method === 'HEAD') return { action: 'allow' }
    const path = parsed.pathname
    if (/\/interactions\/\d+\/[^/]+\/callback/.test(path)) return { action: 'allow' }
    if (path.endsWith('/oauth2/token')) return { action: 'allow' }
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
  return { id }
}
