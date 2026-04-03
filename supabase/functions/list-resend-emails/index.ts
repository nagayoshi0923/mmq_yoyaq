import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmailSettings } from '../_shared/organization-settings.ts'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, getServiceRoleKey } from '../_shared/security.ts'

interface ListEmailsRequest {
  limit?: number
}

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }
  return []
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await verifyAuth(req, ['admin', 'license_admin', 'staff'])
    if (!authResult.success || !authResult.user) {
      return errorResponse(authResult.error || '認証に失敗しました', authResult.statusCode || 401, corsHeaders)
    }

    let requestBody: ListEmailsRequest = {}
    try {
      requestBody = await req.json()
    } catch {
      requestBody = {}
    }

    const limit = Math.min(Math.max(Number(requestBody.limit || 50), 1), 100)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // users -> staff の順で organization_id を取得
    let organizationId: string | null = null
    const { data: userRow } = await serviceClient
      .from('users')
      .select('organization_id')
      .eq('id', authResult.user.id)
      .maybeSingle()

    organizationId = userRow?.organization_id || null
    if (!organizationId) {
      const { data: staffRow } = await serviceClient
        .from('staff')
        .select('organization_id')
        .eq('user_id', authResult.user.id)
        .maybeSingle()
      organizationId = staffRow?.organization_id || null
    }

    if (!organizationId) {
      return errorResponse('組織情報を取得できませんでした', 403, corsHeaders)
    }

    const emailSettings = await getEmailSettings(serviceClient, organizationId)
    const resendApiKey = emailSettings?.resendApiKey || Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return errorResponse('RESEND_API_KEY が設定されていません', 500, corsHeaders)
    }

    const resendResponse = await fetch(`https://api.resend.com/emails?limit=${limit}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
      },
    })

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text()
      console.error('Resend list emails API error:', resendResponse.status, errorText)
      throw new Error('Resend APIからメール履歴を取得できませんでした')
    }

    const resendData = await resendResponse.json() as { data?: Array<Record<string, unknown>> }
    const emails = Array.isArray(resendData?.data) ? resendData.data : []

    const normalizedEmails = emails.map((email) => ({
      id: String(email.id ?? ''),
      to: normalizeRecipients(email.to),
      from: String(email.from ?? ''),
      subject: String(email.subject ?? ''),
      created_at: String(email.created_at ?? ''),
      last_event: String(email.last_event ?? ''),
    }))

    return new Response(
      JSON.stringify({
        success: true,
        emails: normalizedEmails,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({
        success: false,
        error: sanitizeErrorMessage(message, 'メール履歴の取得に失敗しました'),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
