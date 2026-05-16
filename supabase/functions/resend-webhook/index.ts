import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Webhook } from 'npm:svix@1.61.0'
import { getServiceRoleKey } from '../_shared/security.ts'
import { updateEmailLogByProviderId, type EmailLogStatus, type EmailLogUpdate } from '../_shared/email-logs.ts'

type ResendEventPayload = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    from?: string
    to?: string[] | string
    subject?: string
  }
}

// Resend イベント種別 → email_logs ステータス/タイムスタンプへのマッピング
function buildLogUpdate(
  eventType: string,
  eventTime: string | undefined,
): EmailLogUpdate | null {
  const ts = eventTime ?? new Date().toISOString()

  switch (eventType) {
    case 'email.delivered':
      return { status: 'delivered' as EmailLogStatus, delivered_at: ts }
    case 'email.opened':
      return { status: 'opened' as EmailLogStatus, opened_at: ts }
    case 'email.clicked':
      return { status: 'clicked' as EmailLogStatus }
    case 'email.bounced':
      return { status: 'bounced' as EmailLogStatus, bounced_at: ts }
    case 'email.complained':
      return { status: 'complained' as EmailLogStatus, complained_at: ts }
    case 'email.delivery_delayed':
      return { status: 'delivery_delayed' as EmailLogStatus }
    case 'email.failed':
      return { status: 'failed' as EmailLogStatus }
    default:
      // sent など未マップのイベントは更新しない
      return null
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const signingSecret = Deno.env.get('RESEND_WEBHOOK_SIGNING_SECRET')
  if (!signingSecret) {
    console.error('RESEND_WEBHOOK_SIGNING_SECRET is not set')
    return jsonResponse({ error: 'Webhook signing secret is not configured' }, 500)
  }

  const rawPayload = await req.text()

  const svixHeaders = {
    'svix-id':        req.headers.get('svix-id')        ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
    return jsonResponse({ error: 'Missing svix signature headers' }, 400)
  }

  try {
    const webhook = new Webhook(signingSecret)
    const event = webhook.verify(rawPayload, svixHeaders) as ResendEventPayload

    const eventType = event?.type ?? 'unknown'
    const emailId   = event?.data?.email_id ?? null

    // メタデータのみをログ（PII 漏洩防止）
    console.log('✅ Resend webhook received', {
      type:       eventType,
      email_id:   emailId,
      created_at: event?.created_at ?? null,
      to_count:   Array.isArray(event?.data?.to)
        ? event?.data?.to.length
        : event?.data?.to ? 1 : 0,
    })

    // email_logs を更新
    if (emailId) {
      const logUpdate = buildLogUpdate(eventType, event?.created_at)
      if (logUpdate) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          getServiceRoleKey(),
        )
        await updateEmailLogByProviderId(supabase, emailId, logUpdate)
      }
    } else {
      // email_id が取れない場合は警告のみ（ペイロード全体は保存しない）
      console.warn('⚠️ Resend webhook: email_id not found in payload, type=', eventType)
    }

    return jsonResponse({ received: true }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Resend webhook verification failed:', message)
    return jsonResponse({ error: 'Invalid webhook signature' }, 400)
  }
})
