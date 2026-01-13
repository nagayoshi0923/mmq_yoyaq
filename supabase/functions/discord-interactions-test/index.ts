// 超シンプルなテスト用エンドポイント
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/security.ts'

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!

// Discord署名検証（ライブラリ使用版）
async function verifySignature(
  request: Request,
  body: string
): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  
  console.log('Signature:', signature)
  console.log('Timestamp:', timestamp)
  console.log('Public Key:', DISCORD_PUBLIC_KEY)
  
  if (!signature || !timestamp) {
    console.log('Missing signature or timestamp')
    return false
  }

  try {
    const encoder = new TextEncoder()
    const message = encoder.encode(timestamp + body)
    
    // 署名を16進数文字列からUint8Arrayに変換
    const sig = hexToUint8Array(signature)
    // 公開鍵を16進数文字列からUint8Arrayに変換
    const key = hexToUint8Array(DISCORD_PUBLIC_KEY)

    // Web Crypto APIを使用して署名検証
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      sig,
      message
    )
    
    console.log('Signature verification result:', isValid)
    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)
  // Discord署名ヘッダーを追加
  corsHeaders['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp'

  console.log('🔥 Function invoked!')
  
  // OPTIONSリクエスト（プリフライト）の処理
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request received')
    return new Response('ok', { headers: corsHeaders })
  }
  
  // 認証ヘッダーを無視して続行
  console.log('Proceeding without authentication')
  
  console.log('=== Request received ===')
  console.log('Method:', req.method)
  console.log('URL:', req.url)
  console.log('Headers:', Object.fromEntries(req.headers))
  
  const body = await req.text()
  console.log('Body:', body)
  
  // 署名検証を完全に無効化
  console.log('⚠️ Signature verification completely disabled')
  
  try {
    const data = JSON.parse(body)
    console.log('Parsed data:', data)
    
    // Discordの PING (type: 1) に対して PONG (type: 1) を返す
    if (data.type === 1) {
      console.log('Responding with PONG')
      return new Response(
        JSON.stringify({ type: 1 }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error) {
    console.error('Error:', error)
  }
  
  return new Response(
    JSON.stringify({ message: 'OK' }),
    { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
})

