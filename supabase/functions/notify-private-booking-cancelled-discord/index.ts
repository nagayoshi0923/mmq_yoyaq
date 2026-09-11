// 旧クライアント互換。送信はDBトリガー→永続キューに統一する。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'
serve(async (req) => {
  const headers = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (!isCronOrServiceRoleCall(req)) {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, getServiceRoleKey())
    const { data, error } = await client.auth.getUser((req.headers.get('authorization') || '').replace(/^Bearer /i, ''))
    if (error || !data.user) return errorResponse('Unauthorized', 401, headers)
  }
  return new Response(JSON.stringify({ success: true, delivery: 'database_queue' }), { headers: { ...headers, 'Content-Type': 'application/json' } })
})
