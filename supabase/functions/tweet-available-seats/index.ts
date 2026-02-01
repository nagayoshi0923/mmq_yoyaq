import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, verifyAuth, errorResponse, sanitizeErrorMessage, checkRateLimit, getClientIP, rateLimitResponse, timingSafeEqualString, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'

function isServiceRoleCall(req: Request): boolean {
  // Cron Secret / Service Role Key によるシステム呼び出しを許可
  if (isCronOrServiceRoleCall(req)) return true

  // 互換: Authorization: Bearer <service_role_key>
  const authHeader = (req.headers.get('Authorization') || '').trim()
  const serviceRoleKey = getServiceRoleKey()
  if (!authHeader || !serviceRoleKey) return false
  const token = authHeader.replace(/^Bearer\s+/i, '')
  return timingSafeEqualString(token, serviceRoleKey)
}

function isProbablyPrivateIpHost(hostname: string): boolean {
  // Best-effort SSRF guard: block localhost and private IPv4 ranges (no DNS resolution)
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local')) return true
  if (h === '::1' || h === '[::1]') return true
  if (h.startsWith('127.')) return true
  if (h.startsWith('10.')) return true
  if (h.startsWith('192.168.')) return true
  if (h.startsWith('169.254.')) return true
  // 172.16.0.0/12
  const m = h.match(/^172\.(\d+)\./)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 16 && n <= 31) return true
  }
  return false
}

function isSafeHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (isProbablyPrivateIpHost(u.hostname)) return false
    return true
  } catch {
    return false
  }
}

function toBase64(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin)
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return toBase64(sig)
}

// OAuth 1.0a署名生成
async function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): Promise<string> {
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
  return await hmacSha1Base64(signingKey, signatureBaseString)
}

// OAuth 1.0aヘッダー生成
async function generateOAuthHeader(
  method: string,
  url: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  additionalParams: Record<string, string> = {}
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
    ...additionalParams
  }

  const signature = await generateOAuthSignature(
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
    if (!isSafeHttpsUrl(imageUrl)) {
      console.warn('⚠️ 画像URLが安全要件を満たさないためスキップ:', imageUrl)
      return null
    }

    // 画像をダウンロード
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const imageResponse = await fetch(imageUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!imageResponse.ok) {
      console.error('画像のダウンロードに失敗:', imageUrl)
      return null
    }

    const contentLength = imageResponse.headers.get('content-length')
    if (contentLength && Number(contentLength) > 5 * 1024 * 1024) {
      console.warn('⚠️ 画像サイズが大きすぎるためスキップ:', contentLength)
      return null
    }
    
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = toBase64(imageBuffer)

    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'
    
    const formData = new FormData()
    formData.append('media_data', base64Image)

    const authHeader = await generateOAuthHeader(
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
  
  const authHeader = await generateOAuthHeader(
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

// 配列からランダムに1つ選択
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// 残り席数に応じたヘッダー表現
function getSeatsHeader(availableSeats: number, maxParticipants: number): string {
  // 残り1席
  if (availableSeats === 1) {
    return randomPick([
      '🔥【ラスト1席！】',
      '⚡【残り1席のみ！】',
      '🎯【あと1人で満席！】',
      '✨【最後の1席！】',
      '🚨【ラスト1枠！お急ぎください】',
    ])
  }
  
  // 残り2席
  if (availableSeats === 2) {
    return randomPick([
      '🔥【残り2席！】',
      '⚡【あと2席！】',
      '🎭【残りわずか2席！】',
      '✨【ラスト2枠！】',
    ])
  }
  
  // 残り3席以下
  if (availableSeats <= 3) {
    return randomPick([
      `🔥【残り${availableSeats}席！】`,
      `⚡【あと${availableSeats}席！】`,
      `🎭【残りわずか${availableSeats}席！】`,
    ])
  }
  
  // 半分以上埋まっている
  if (availableSeats <= maxParticipants / 2) {
    return randomPick([
      `🎭【残り${availableSeats}席】`,
      `✨【あと${availableSeats}席空いてます】`,
      `📣【${availableSeats}席まだ空いてます！】`,
    ])
  }
  
  // まだ余裕がある
  return randomPick([
    `🎭【${availableSeats}席空いてます】`,
    `✨【参加者募集中！残り${availableSeats}席】`,
    `📣【まだ間に合う！残り${availableSeats}席】`,
  ])
}

// 宣伝文句のパターン
function getPromoMessage(availableSeats: number): string {
  // 残り少ない時の緊急感
  if (availableSeats <= 2) {
    return randomPick([
      '今すぐご予約を！',
      'お早めにどうぞ！',
      'ご予約はお急ぎください！',
      '埋まる前にぜひ！',
      'このチャンスをお見逃しなく！',
    ])
  }
  
  // 通常の宣伝文句
  return randomPick([
    '一緒に謎を解きませんか？',
    'あなたの参加をお待ちしています！',
    '初めての方も大歓迎！',
    '友達を誘って参加しよう！',
    'お一人様でも参加OK！',
    '非日常の体験をあなたに。',
    '推理好きなあなたへ。',
    '明日、物語の主人公になろう。',
    'リアル推理ゲームを体験しよう！',
    '犯人は誰だ…？',
  ])
}

// 時間帯に応じた挨拶
function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) {
    return randomPick(['おはようございます☀️', ''])
  } else if (hour >= 12 && hour < 17) {
    return randomPick(['こんにちは🌤️', ''])
  } else {
    return randomPick(['こんばんは🌙', '夜の告知です🌙', ''])
  }
}

// ツイート本文を生成
function generateTweetText(
  scenarioTitle: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  storeName: string,
  availableSeats: number,
  maxParticipants: number,
  bookingUrl: string
): string {
  const header = getSeatsHeader(availableSeats, maxParticipants)
  const greeting = getTimeGreeting()
  const promo = getPromoMessage(availableSeats)
  const formattedDate = formatDate(dateStr)
  
  // 複数のツイートパターン
  const patterns = [
    // パターン1: シンプル
    `${header}明日の公演！

📖 ${scenarioTitle}
📅 ${formattedDate} ${startTime}〜${endTime}
📍 ${storeName}

${promo}

ご予約👇
${bookingUrl}

#マーダーミステリー #MMQ`,

    // パターン2: 挨拶付き
    `${greeting}
${header}

明日【${scenarioTitle}】やります！

🕐 ${formattedDate} ${startTime}〜
📍 ${storeName}

${promo}

予約はこちら👇
${bookingUrl}

#マダミス #謎解き`,

    // パターン3: 緊急感あり
    `${header}

【${scenarioTitle}】
📅 明日 ${startTime}開演
📍 ${storeName}

${promo}
ご予約お待ちしております！

${bookingUrl}

#マーダーミステリー #体験型ゲーム`,

    // パターン4: カジュアル
    `明日、空きあります！

🎭 ${scenarioTitle}
${header.replace(/【|】/g, '')}

⏰ ${formattedDate} ${startTime}〜${endTime}
📍 ${storeName}

${promo}

${bookingUrl}

#マダミス #MMQ #${storeName.replace(/\s/g, '')}`,

    // パターン5: 物語風
    `明日、あなたは物語の登場人物になる──

🎭 ${scenarioTitle}
📅 ${formattedDate} ${startTime}〜
📍 ${storeName}

${header}

${bookingUrl}

#マーダーミステリー #謎解き #体験型`,
  ]

  return randomPick(patterns)
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 レートリミット（乱用防止）
    const serviceClientForRateLimit = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const clientIP = getClientIP(req)
    const rateLimit = await checkRateLimit(serviceClientForRateLimit, clientIP, 'tweet-available-seats', 5, 60)
    if (!rateLimit.allowed) {
      console.warn('⚠️ レートリミット超過:', clientIP)
      return rateLimitResponse(rateLimit.retryAfter, corsHeaders)
    }

    // 🔒 認証チェック（Cron/運用者のみ）
    if (!isServiceRoleCall(req)) {
      const authResult = await verifyAuth(req, ['admin', 'owner'])
      if (!authResult.success) {
        console.warn('⚠️ 認証失敗: tweet-available-seats への不正アクセス試行')
        return errorResponse(
          authResult.error || '認証が必要です',
          authResult.statusCode || 401,
          corsHeaders
        )
      }
      console.log('✅ 管理者認証成功:', authResult.user?.email)
    } else {
      console.log('✅ Service Role Key 認証成功（Cron/システム呼び出し）')
    }

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

      // ツイート本文を生成（ランダムパターン）
      const tweetText = generateTweetText(
        scenarioTitle,
        event.date,
        event.start_time,
        event.end_time,
        storeName,
        availableSeats,
        maxParticipants,
        baseUrl
      )

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
        error: sanitizeErrorMessage(error, 'ツイート投稿に失敗しました')
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

