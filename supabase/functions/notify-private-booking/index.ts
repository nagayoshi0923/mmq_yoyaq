// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const LINE_NOTIFY_TOKEN = Deno.env.get('LINE_NOTIFY_TOKEN')!
const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')!

interface PrivateBookingNotification {
  type: 'insert'
  table: string
  record: {
    id: string
    customer_name: string
    customer_email: string
    customer_phone: string
    scenario_title: string
    participant_count: number
    candidate_datetimes: {
      candidates: Array<{
        order: number
        date: string
        timeSlot: string
        startTime: string
        endTime: string
      }>
      requestedStores?: Array<{
        storeId: string
        storeName: string
      }>
    }
    notes?: string
    created_at: string
  }
  old_record: null
}

serve(async (req) => {
  try {
    const payload: PrivateBookingNotification = await req.json()

    // Supabaseクライアントを初期化
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 通知設定をチェック
    const { data: notificationSettings, error: settingsError } = await supabaseClient
      .from('notification_settings')
      .select('new_reservation_email, new_reservation_discord')
      .eq('store_id', 'default')
      .maybeSingle()

    if (settingsError) {
      console.error('通知設定取得エラー:', settingsError)
    }

    // すべての通知が無効の場合はスキップ
    if (notificationSettings && !notificationSettings.new_reservation_email && !notificationSettings.new_reservation_discord) {
      console.log('⚠️ All notifications are disabled in settings')
      return new Response(
        JSON.stringify({ message: 'All notifications are disabled' }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    }
    
    // 新規作成のみ通知（更新は除外）
    if (payload.type !== 'insert') {
      return new Response(
        JSON.stringify({ message: 'Not a new booking, skipping notification' }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    }

    const booking = payload.record
    
    // 候補日時を整形
    const candidatesText = booking.candidate_datetimes.candidates
      .map(c => {
        const date = new Date(c.date)
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`
        return `  ${c.order}. ${dateStr} ${c.timeSlot} (${c.startTime}-${c.endTime})`
      })
      .join('\n')
    
    // 希望店舗を整形
    const storesText = booking.candidate_datetimes.requestedStores
      ?.map(s => s.storeName)
      .join(', ') || '全店舗'
    
    // 通知メッセージ
    const message = `🎭 新規貸切リクエスト

📋 シナリオ: ${booking.scenario_title}
👤 お客様: ${booking.customer_name}
📧 Email: ${booking.customer_email}
📞 電話: ${booking.customer_phone}
👥 人数: ${booking.participant_count}名

📅 候補日時:
${candidatesText}

🏢 希望店舗: ${storesText}

${booking.notes ? `📝 備考: ${booking.notes}` : ''}

▶️ 確認: ${Deno.env.get('SITE_URL') || 'https://your-site.com'}#gm-availability-check`

    // LINE通知を送信（メール通知設定が有効な場合のみ）
    if (LINE_NOTIFY_TOKEN && notificationSettings?.new_reservation_email !== false) {
      const lineResponse = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`
        },
        body: `message=${encodeURIComponent(message)}`
      })
      
      if (!lineResponse.ok) {
        console.error('LINE notification failed:', await lineResponse.text())
      }
    }

    // Discord通知を送信（Discord通知設定が有効な場合のみ）
    if (DISCORD_WEBHOOK_URL && notificationSettings?.new_reservation_discord !== false) {
      const candidateFields = booking.candidate_datetimes.candidates.map(c => {
        const date = new Date(c.date)
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}(${['日','月','火','水','木','金','土'][date.getDay()]})`
        return {
          name: `候補${c.order}`,
          value: `${dateStr} ${c.timeSlot} ${c.startTime}-${c.endTime}`,
          inline: true
        }
      })
      
      const discordResponse = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: '@here 新規貸切リクエストが届きました！',
          username: 'マーダーミステリー予約Bot',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/2972/2972531.png',
          embeds: [{
            title: '🎭 新規貸切リクエスト',
            color: 0x9333ea, // 紫色
            fields: [
              {
                name: '📋 シナリオ',
                value: booking.scenario_title,
                inline: false
              },
              {
                name: '👤 お客様名',
                value: booking.customer_name,
                inline: true
              },
              {
                name: '👥 参加人数',
                value: `${booking.participant_count}名`,
                inline: true
              },
              {
                name: '📧 メールアドレス',
                value: booking.customer_email,
                inline: true
              },
              {
                name: '📞 電話番号',
                value: booking.customer_phone,
                inline: true
              },
              {
                name: '🏢 希望店舗',
                value: storesText,
                inline: false
              },
              ...candidateFields,
              ...(booking.notes ? [{
                name: '📝 備考',
                value: booking.notes,
                inline: false
              }] : [])
            ],
            footer: {
              text: '▶️ GM確認ページで回答してください'
            },
            timestamp: new Date(booking.created_at).toISOString()
          }]
        })
      })
      
      if (!discordResponse.ok) {
        console.error('Discord notification failed:', await discordResponse.text())
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Notifications sent successfully',
        booking_id: booking.id 
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    )
  }
})

