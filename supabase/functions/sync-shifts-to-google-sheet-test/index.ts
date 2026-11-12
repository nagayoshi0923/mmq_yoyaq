import '../_shared/outbound-guard.ts'
// テスト用: 最小限の実装
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { errorResponse, getCorsHeaders, isCronOrServiceRoleCall } from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 テスト用関数だが、公開アクセスは許可しない（Cron/Service Role のみ）
    if (!isCronOrServiceRoleCall(req)) {
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    const payload = await req.json()
    console.log('📊 リクエスト受信:', payload)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test successful',
        payload
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


