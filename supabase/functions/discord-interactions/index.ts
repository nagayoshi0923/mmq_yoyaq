// Discord インタラクション処理（署名検証付き）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DISCORD_PUBLIC_KEY = Deno.env.get('DISCORD_PUBLIC_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Discord署名検証
async function verifySignature(
  request: Request,
  body: string
): Promise<boolean> {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  
  if (!signature || !timestamp) {
    console.log('Missing signature or timestamp')
    return false
  }

  const encoder = new TextEncoder()
  const message = encoder.encode(timestamp + body)
  const sig = hexToUint8Array(signature)
  const key = hexToUint8Array(DISCORD_PUBLIC_KEY)

  try {
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
    
    console.log('Signature verification:', isValid)
    return isValid
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
}

// CORS ヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp',
}

serve(async (req) => {
  console.log('🚀 Discord interactions function called!')
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const body = await req.text()
  console.log('Body:', body)
  
  // 署名検証
  console.log('🔐 Starting signature verification...')
  const isValid = await verifySignature(req, body)
  console.log('🔐 Signature verification result:', isValid)
  
  if (!isValid) {
    console.log('❌ Invalid signature - rejecting request')
    return new Response('Invalid signature', { 
      status: 401,
      headers: corsHeaders 
    })
  }
  
  console.log('✅ Signature verification passed')

  const interaction = JSON.parse(body)
  console.log('Interaction:', interaction)

  // PING に対して PONG を返す
  if (interaction.type === 1) {
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

  // ボタンクリック処理
  if (interaction.type === 3) {
    console.log('Button clicked:', interaction.data.custom_id)
    
    try {
      if (interaction.data.custom_id.startsWith('gm_available_')) {
        console.log('✅ Processing gm_available button')
        // 出勤可能ボタンがクリックされた場合
        const response = new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: '出勤可能な日程を選択してください',
              components: [{
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3,
                    label: '候補1: 10/16(木) 昼 14:00-17:00',
                    custom_id: 'date_1'
                  },
                  {
                    type: 2,
                    style: 3,
                    label: '候補2: 10/17(金) 朝 10:00-13:00',
                    custom_id: 'date_2'
                  }
                ]
              }, {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3,
                    label: '候補3: 10/17(金) 夜 18:00-21:00',
                    custom_id: 'date_3'
                  }
                ]
              }]
            }
          }),
          { 
            status: 200,
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json' 
            }
          }
        )
        console.log('✅ Returning gm_available response')
        return response
      }
      
      if (interaction.data.custom_id.startsWith('gm_unavailable_')) {
        console.log('❌ Processing gm_unavailable button')
        // 全て出勤不可ボタンがクリックされた場合
        const response = new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: '出勤不可として記録しました。'
            }
          }),
          { 
            status: 200,
            headers: { 
              ...corsHeaders,
              'Content-Type': 'application/json' 
            }
          }
        )
        console.log('❌ Returning gm_unavailable response')
        return response
      }
      
      console.log('⚠️ Unknown button clicked:', interaction.data.custom_id)
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: 'エラー: 不明なボタンです'
          }
        }),
        { 
          status: 200,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json' 
          }
        }
      )
      
    } catch (error) {
      console.error('🚨 Error processing button click:', error)
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: 'エラーが発生しました'
          }
        }),
        { 
          status: 200,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json' 
          }
        }
      )
    }
  }

  // セレクトメニュー処理
  if (interaction.type === 3 && interaction.data.component_type === 3) {
    console.log('Select menu submitted:', interaction.data.values)
    
    return new Response(
      JSON.stringify({
        type: 4,
        data: {
          content: `選択された日程: ${interaction.data.values[0]}`
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return new Response(
    JSON.stringify({ error: 'Unknown interaction type' }),
    { 
      status: 400,
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json' 
      }
    }
  )
})