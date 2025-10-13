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
        
        // リクエストIDを取得
        const requestId = interaction.data.custom_id.replace('gm_available_', '')
        console.log('📋 Request ID:', requestId)
        
        try {
          // Supabaseから候補日程を取得
          const { data: reservation, error } = await supabase
            .from('reservations')
            .select('candidate_datetimes, title')
            .eq('id', requestId)
            .single()
          
          if (error) {
            console.error('❌ Error fetching reservation:', error)
            throw error
          }
          
          console.log('📅 Reservation data:', reservation)
          
          const candidates = reservation.candidate_datetimes?.candidates || []
          const components = []
          
          // 候補日程をボタンに変換（最大5個まで、1行に最大5個）
          for (let i = 0; i < Math.min(candidates.length, 5); i++) {
            const candidate = candidates[i]
            const dateStr = candidate.date.replace('2025-', '').replace('-', '/')
            const timeSlotMap = {
              '朝': '朝',
              '昼': '昼', 
              '夜': '夜',
              'morning': '朝',
              'afternoon': '昼',
              'evening': '夜'
            }
            const timeSlot = timeSlotMap[candidate.timeSlot] || candidate.timeSlot
            
            if (i % 5 === 0) {
              components.push({
                type: 1,
                components: []
              })
            }
            
            components[components.length - 1].components.push({
              type: 2,
              style: 3,
              label: `候補${i + 1}: ${dateStr} ${timeSlot} ${candidate.startTime}-${candidate.endTime}`,
              custom_id: `date_${i + 1}_${requestId}`
            })
          }
          
          const response = new Response(
            JSON.stringify({
              type: 4,
              data: {
                content: '出勤可能な日程を選択してください',
                components: components
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
          console.log('✅ Returning gm_available response with dynamic dates')
          return response
          
        } catch (error) {
          console.error('🚨 Error processing gm_available:', error)
          return new Response(
            JSON.stringify({
              type: 4,
              data: {
                content: 'エラー: 候補日程の取得に失敗しました'
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
      
      // 日程選択ボタンの処理
      if (interaction.data.custom_id.startsWith('date_')) {
        console.log('📅 Processing date selection:', interaction.data.custom_id)
        
        // custom_idから情報を抽出: date_1_requestId
        const parts = interaction.data.custom_id.split('_')
        const dateIndex = parseInt(parts[1]) - 1 // 0-based index
        const requestId = parts.slice(2).join('_')
        
        console.log('📋 Date index:', dateIndex, 'Request ID:', requestId)
        
        try {
          // Supabaseから候補日程を取得
          const { data: reservation, error } = await supabase
            .from('reservations')
            .select('candidate_datetimes, title')
            .eq('id', requestId)
            .single()
          
          if (error) {
            console.error('❌ Error fetching reservation:', error)
            throw error
          }
          
          const candidates = reservation.candidate_datetimes?.candidates || []
          const selectedCandidate = candidates[dateIndex]
          
          if (!selectedCandidate) {
            throw new Error('Selected candidate not found')
          }
          
          const dateStr = selectedCandidate.date.replace('2025-', '').replace('-', '/')
          const timeSlotMap = {
            '朝': '朝',
            '昼': '昼', 
            '夜': '夜',
            'morning': '朝',
            'afternoon': '昼',
            'evening': '夜'
          }
          const timeSlot = timeSlotMap[selectedCandidate.timeSlot] || selectedCandidate.timeSlot
          const selectedDate = `${dateStr} ${timeSlot} ${selectedCandidate.startTime}-${selectedCandidate.endTime}`
          
          const response = new Response(
            JSON.stringify({
              type: 4,
              data: {
                content: `✅ 出勤可能日程として「${selectedDate}」を記録しました。ありがとうございます！`
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
          console.log('📅 Date selection recorded:', selectedDate)
          return response
          
        } catch (error) {
          console.error('🚨 Error processing date selection:', error)
          return new Response(
            JSON.stringify({
              type: 4,
              data: {
                content: 'エラー: 日程の記録に失敗しました'
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