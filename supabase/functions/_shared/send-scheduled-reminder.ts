declare const Deno: { env: { get(name: string): string | undefined } }
/** 関数ごとのランタイムキーではなく、送信先でも照合できる共通キーを使う。 */
export async function sendScheduledReminder(
  body: Record<string, unknown>,
  env: (name: string) => string | undefined = name => Deno.env.get(name),
  send: typeof fetch = fetch,
) {
  const baseUrl = (env('SUPABASE_URL') || '').replace(/\/$/, '')
  const key = env('MMQ_LEGACY_SERVICE_ROLE_KEY')?.trim()
  if (!baseUrl || !key) throw new Error('reminder service authentication is not configured')
  const response = await send(`${baseUrl}/functions/v1/send-reminder-emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const result = await response.json().catch(() => null)
  // 応答本文は顧客情報を含み得るためログへ複製しない。
  if (!response.ok || result?.success !== true) throw new Error(`reminder sender HTTP ${response.status}`)
  return result
}
