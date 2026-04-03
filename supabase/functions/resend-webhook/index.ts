import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Webhook } from 'npm:svix@1.61.0'

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
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  if (!svixHeaders['svix-id'] || !svixHeaders['svix-timestamp'] || !svixHeaders['svix-signature']) {
    return jsonResponse({ error: 'Missing svix signature headers' }, 400)
  }

  try {
    const webhook = new Webhook(signingSecret)
    const event = webhook.verify(rawPayload, svixHeaders) as ResendEventPayload

    // Keep only metadata logs to avoid leaking full message content.
    console.log('✅ Resend webhook received', {
      type: event?.type ?? 'unknown',
      email_id: event?.data?.email_id ?? null,
      created_at: event?.created_at ?? null,
      to_count: Array.isArray(event?.data?.to)
        ? event?.data?.to.length
        : event?.data?.to
          ? 1
          : 0,
    })

    return jsonResponse({ received: true }, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('❌ Resend webhook verification failed:', message)
    return jsonResponse({ error: 'Invalid webhook signature' }, 400)
  }
})
