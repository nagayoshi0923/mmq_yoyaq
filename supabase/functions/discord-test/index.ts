// 超シンプルなDiscordテスト関数
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  console.log('🚀 Discord test function called!')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('Headers:', Object.fromEntries(req.headers))
  
  // 認証ヘッダーが無い場合は、サービスロールキーを使用
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    console.log('⚠️ No auth header, using service role')
    // 環境変数からサービスロールキーを取得
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (serviceKey) {
      req.headers.set('authorization', `Bearer ${serviceKey}`)
    }
  }
  
  const body = await req.text()
  console.log('Body:', body)
  
  // Discord PING に対して PONG を返す
  if (req.method === 'POST') {
    try {
      const data = JSON.parse(body)
      if (data.type === 1) {
        console.log('✅ PONG response sent')
        return new Response(
          JSON.stringify({ type: 1 }),
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    } catch (e) {
      console.log('JSON parse error:', e)
    }
  }
  
  console.log('✅ Default response sent')
  return new Response(
    JSON.stringify({ message: 'Hello from Supabase!' }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
})
