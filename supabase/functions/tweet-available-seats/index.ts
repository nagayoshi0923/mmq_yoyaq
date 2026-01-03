import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// OAuth 1.0a署名生成
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  // パラメータをソート
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')

  // Signature Base String
  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  // Signing Key
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`

  // HMAC-SHA1署名
  const signature = hmac('sha1', signingKey, signatureBaseString, 'utf8', 'base64')
  return signature as string
}

// OAuth 1.0aヘッダー生成
function generateOAuthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  additionalParams: Record<string, string> = {}
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...additionalParams
  }

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    apiSecret,
    accessTokenSecret
  )

  oauthParams.oauth_signature = signature

  const headerString = Object.keys(oauthParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(oauthParams[key])}"`)
    .join(', ')

  return `OAuth ${headerString}`
}

// 画像をアップロード（Twitter API v1.1）
async function uploadMedia(
  imageUrl: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<string | null> {
  try {
    // 画像をダウンロード
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error('画像のダウンロードに失敗:', imageUrl)
      return null
    }
    
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))

    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'
    
    const formData = new FormData()
    formData.append('media_data', base64Image)

    const authHeader = generateOAuthHeader(
      'POST',
      uploadUrl,
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret
    )

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('メディアアップロードエラー:', errorText)
      return null
    }

    const data = await response.json()
    return data.media_id_string
  } catch (error) {
    console.error('メディアアップロード例外:', error)
    return null
  }
}

// ツイートを投稿
async function postTweet(
  text: string,
  mediaId: string | null,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const tweetUrl = 'https://api.twitter.com/2/tweets'
  
  const authHeader = generateOAuthHeader(
    'POST',
    tweetUrl,
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret
  )

  const body: any = { text }
  if (mediaId) {
    body.media = { media_ids: [mediaId] }
  }

  try {
    const response = await fetch(tweetUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('ツイート投稿エラー:', data)
      return { success: false, error: JSON.stringify(data) }
    }

    return { success: true, data }
  } catch (error) {
    console.error('ツイート投稿例外:', error)
    return { success: false, error: String(error) }
  }
}

// 日付をフォーマット（例: 1月5日(日)）
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const dayOfWeek = dayNames[date.getDay()]
  return `${month}月${day}日(${dayOfWeek})`
}

serve(async (req) => {
  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Twitter API認証情報
    const apiKey = Deno.env.get('TWITTER_API_KEY')
    const apiSecret = Deno.env.get('TWITTER_API_SECRET')
    const accessToken = Deno.env.get('TWITTER_ACCESS_TOKEN')
    const accessTokenSecret = Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET')

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      throw new Error('Twitter API認証情報が設定されていません')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 翌日の日付を計算
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    console.log(`対象日: ${tomorrowStr}`)

    // 翌日の予約可能な公演を取得（満席でないもの）
    const { data: events, error: eventsError } = await supabaseClient
      .from('schedule_events')
      .select(`
        id,
        date,
        start_time,
        end_time,
        current_participants,
        max_participants,
        store_id,
        scenario_id,
        stores:store_id (
          id,
          name,
          short_name
        ),
        scenarios:scenario_id (
          id,
          title,
          key_visual_url,
          player_count_max
        )
      `)
      .eq('date', tomorrowStr)
      .eq('is_cancelled', false)
      .eq('is_reservation_enabled', true)
      .eq('category', 'open') // 一般公演のみ

    if (eventsError) throw eventsError

    if (!events || events.length === 0) {
      console.log('翌日に公演がありません')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '翌日に公演がありません',
          count: 0 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // 満席でない公演をフィルタリング
    const availableEvents = events.filter(event => {
      const maxParticipants = event.max_participants || event.scenarios?.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      return currentParticipants < maxParticipants
    })

    if (availableEvents.length === 0) {
      console.log('空きのある公演がありません')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '空きのある公演がありません',
          count: 0 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log(`ツイート対象の公演数: ${availableEvents.length}`)

    // 予約ページのベースURL（環境変数から取得、なければデフォルト）
    const baseUrl = Deno.env.get('PUBLIC_BOOKING_URL') || 'https://mmq-yoyaq.vercel.app/booking'

    let tweetCount = 0
    const errors: string[] = []

    // 各公演についてツイート
    for (const event of availableEvents) {
      const maxParticipants = event.max_participants || event.scenarios?.player_count_max || 8
      const currentParticipants = event.current_participants || 0
      const availableSeats = maxParticipants - currentParticipants

      const scenarioTitle = event.scenarios?.title || '未定'
      const storeName = event.stores?.name || event.stores?.short_name || ''
      const imageUrl = event.scenarios?.key_visual_url

      // ツイート本文を作成
      const tweetText = `🎭【残り${availableSeats}席】明日の公演！

📖 ${scenarioTitle}
📅 ${formatDate(event.date)} ${event.start_time}〜${event.end_time}
📍 ${storeName}

ご予約はこちら👇
${baseUrl}

#マーダーミステリー #MMQ #${storeName.replace(/\s/g, '')}`

      console.log(`ツイート作成: ${scenarioTitle}`)

      // 画像がある場合はアップロード
      let mediaId: string | null = null
      if (imageUrl) {
        mediaId = await uploadMedia(
          imageUrl,
          apiKey,
          apiSecret,
          accessToken,
          accessTokenSecret
        )
      }

      // ツイート投稿
      const result = await postTweet(
        tweetText,
        mediaId,
        apiKey,
        apiSecret,
        accessToken,
        accessTokenSecret
      )

      if (result.success) {
        console.log(`ツイート成功: ${scenarioTitle}`)
        tweetCount++
      } else {
        console.error(`ツイート失敗: ${scenarioTitle}`, result.error)
        errors.push(`${scenarioTitle}: ${result.error}`)
      }

      // レート制限対策: 各ツイート間に少し待機
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${tweetCount}件のツイートを投稿しました`,
        targetDate: tomorrowStr,
        totalEvents: availableEvents.length,
        tweetCount,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'ツイート投稿に失敗しました' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

