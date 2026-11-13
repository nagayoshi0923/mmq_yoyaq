// 検証環境（ステージング）から実在の宛先へメール・Discord・X を送らない守り（#1281）。
// 各 Edge Function の先頭で `import '../_shared/outbound-guard.ts'` するだけで、
// その関数の fetch を差し替える。本番ではメール送信の間隔あけだけを行う。
//
// 写しのデータを伏せる（scripts/mask-staging-pii.sql）のが一つ目の守りで、
// 伏せ漏れがあってもここで止めるのが二つ目の守り。
// 検証用に実際に届けたい宛先は STAGING_EMAIL_ALLOWLIST / STAGING_DISCORD_ALLOWLIST に入れる。

import { blockedResponseBody, decideOutbound, EMAIL_SEND_GAP_MS, isResendSendUrl, isStagingEnvironment, stagingIdempotencyKey, tagStagingEmailBody, type OutboundGuardEnv } from './outbound-guard-core.ts'

const INSTALLED = Symbol.for('mmq.outboundGuardInstalled')

function readEnv(): OutboundGuardEnv {
  return {
    appEnv: Deno.env.get('APP_ENV'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    emailAllowlist: Deno.env.get('STAGING_EMAIL_ALLOWLIST'),
    discordAllowlist: Deno.env.get('STAGING_DISCORD_ALLOWLIST'),
    discordApplicationId: Deno.env.get('DISCORD_APPLICATION_ID') || Deno.env.get('DISCORD_CLIENT_ID'),
  }
}

async function bodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body === 'string') return init.body
    try {
      return await new Response(init.body).text()
    } catch {
      return null
    }
  }
  if (input instanceof Request) {
    try {
      return await input.clone().text()
    } catch {
      return null
    }
  }
  return null
}

function installOutboundGuard(): void {
  const globalRecord = globalThis as unknown as Record<symbol, boolean>
  if (globalRecord[INSTALLED]) return
  globalRecord[INSTALLED] = true

  const env = readEnv()
  const rawFetch = globalThis.fetch.bind(globalThis)

  // 本番も検証環境も、Resend へのメール送信は 1 通ごとに間隔をあける（迷惑メールに見える一斉送信をしない）。
  // 2026-11-13、停止明けに約100通を短時間で流し、Microsoft 系で配信遅延が出た。
  let lastSendAt = 0
  const pacedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'POST' && isResendSendUrl(url)) {
      const wait = lastSendAt + EMAIL_SEND_GAP_MS - Date.now()
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
      lastSendAt = Date.now()
    }
    return rawFetch(input, init)
  }

  if (!isStagingEnvironment(env)) {
    globalThis.fetch = pacedFetch
    return
  }

  const originalFetch = pacedFetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method || (input instanceof Request ? input.method : 'GET')
    const host = (() => {
      try {
        return new URL(url).hostname
      } catch {
        return ''
      }
    })()
    const watched = host === 'api.resend.com' || host.includes('discord') || host.includes('twitter.com') || host === 'api.x.com'
    if (!watched) return originalFetch(input, init)

    // 本文を読むと init.body のストリームを使い切るため、文字列にして渡し直す
    const text = await bodyText(input, init)
    const decision = decideOutbound({ url, method, body: text }, env)
    if (decision.action === 'allow') {
      // 本番と同じ重複防止キーを使うと本番の送信が 409 で弾かれるため、検証環境のキーは付け替える
      const headers = new Headers(input instanceof Request ? input.headers : undefined)
      new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
      const idempotencyKey = headers.get('idempotency-key')
      // 送信には検証環境の目印タグを付ける（本番の Webhook が本番の送信ログへ書かないように）
      const isResendSend = method.toUpperCase() === 'POST' && isResendSendUrl(url)
      if (isResendSend || (host === 'api.resend.com' && idempotencyKey)) {
        if (idempotencyKey) headers.set('idempotency-key', stagingIdempotencyKey(idempotencyKey))
        const sendBody = isResendSend ? tagStagingEmailBody(text) : text
        return originalFetch(input, { ...init, headers, ...(sendBody !== null ? { body: sendBody } : {}) })
      }
      if (init?.body !== undefined && init.body !== null && typeof init.body !== 'string' && text !== null) {
        return originalFetch(input, { ...init, body: text })
      }
      return originalFetch(input, init)
    }
    console.warn(`[outbound-guard] 検証環境のため送信しませんでした: ${decision.channel} ${decision.reason} ${method} ${host}`)
    // Discord の PUT・DELETE（メンバー追加・権限付与・削除）は本物も 204 を返し、呼び出し側は 201/204 を成功とみなす
    if (decision.channel === 'discord' && (method.toUpperCase() === 'PUT' || method.toUpperCase() === 'DELETE')) {
      return new Response(null, { status: 204, headers: { 'x-mmq-staging-blocked': '1' } })
    }
    return new Response(JSON.stringify(blockedResponseBody(decision)), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-mmq-staging-blocked': '1' },
    })
  }
}

installOutboundGuard()
