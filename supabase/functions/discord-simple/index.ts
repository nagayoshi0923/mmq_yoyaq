// 最もシンプルなDiscord関数
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!

// 署名検証
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
    
    const sig = hexToUint8Array(signature)
    const key = hexToUint8Array(DISCORD_PUBLIC_KEY)

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
  console.log('🚀 Simple Discord function called!')
  
  // CORS ヘッダー
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp',
  }
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.text()
  console.log('Body:', body)
  
  // 署名検証
  const isValid = await verifySignature(req, body)
  if (!isValid) {
    console.log('❌ Invalid signature')
    return new Response('Invalid signature', { 
      status: 401,
      headers: corsHeaders 
    })
  }
  console.log('✅ Signature verification passed')
  
  try {
    const data = JSON.parse(body)
    console.log('Parsed data:', data)
    
    // Discord PING に対して PONG を返す
    if (data.type === 1) {
      console.log('✅ Responding with PONG')
      return new Response(
        JSON.stringify({ type: 1 }),
        { 
          status: 200,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json' 
          }
        }
      )
    }
  } catch (error) {
    console.log('JSON parse error:', error)
  }
  
  return new Response(
    JSON.stringify({ message: 'OK' }),
    {
      status: 200,
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json' 
      }
    }
  )
})