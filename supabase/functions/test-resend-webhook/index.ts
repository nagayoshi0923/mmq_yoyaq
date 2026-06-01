/**
 * Resend webhook 動作確認用のテスト送信 Edge Function
 *
 * 直接 Resend API を叩いてテストメールを送り、 数秒後に届く email.delivered
 * webhook が resend-webhook Edge Function で 200 で通るか確認するためのもの。
 *
 * 認証: service_role / sb_secret_* / x-cron-secret のいずれか。
 *
 * 使い方:
 *   curl -X POST https://<project>.supabase.co/functions/v1/test-resend-webhook \
 *     -H "Authorization: Bearer <sb_secret>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"to": "mai.nagayoshi@gmail.com"}'
 */
import { getCorsHeaders, isCronOrServiceRoleCall } from '../_shared/security.ts'

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    })
  }
  if (!isCronOrServiceRoleCall(req)) {
    return new Response(JSON.stringify({ success: false, error: '認証が必要です' }), {
      status: 401,
      headers: corsHeaders,
    })
  }

  let to = 'mai.nagayoshi@gmail.com'
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.to === 'string' && body.to.includes('@')) to = body.to
  } catch (_) { /* ignore */ }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY 未設定' }), {
      status: 500,
      headers: corsHeaders,
    })
  }

  const senderEmail = Deno.env.get('SENDER_EMAIL') || 'noreply@mmq.game'
  const senderName  = Deno.env.get('SENDER_NAME')  || 'クインズワルツ'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${senderEmail}>`,
      to: [to],
      subject: '[テスト] Resend webhook 動作確認',
      text: 'これは Resend webhook 復活確認用のテストメールです。\n\n受信後、 Resend Dashboard で email.delivered イベントが 200 で通れば webhook 復活成功です。',
    }),
  })

  const resendBody = await res.json().catch(() => ({}))
  return new Response(
    JSON.stringify({ success: res.ok, status: res.status, to, resend: resendBody }),
    { status: res.ok ? 200 : 500, headers: corsHeaders },
  )
})
