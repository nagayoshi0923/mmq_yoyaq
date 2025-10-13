// Discord Bot経由で通知を送信（ボタン付き）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN')!
const DISCORD_CHANNEL_ID = Deno.env.get('DISCORD_CHANNEL_ID')! // 通知を送信するチャンネルID

interface PrivateBookingNotification {
  type: 'insert'
  table: string
  record: {
    id: string
    customer_name: string
    customer_email: string
    customer_phone: string
    scenario_id: string
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
}

serve(async (req) => {
  console.log('🔥 Discord notification function called!')
  console.log('Request method:', req.method)
  console.log('Request headers:', Object.fromEntries(req.headers))
  
  try {
    const body = await req.text()
    console.log('Request body:', body)
    const payload: PrivateBookingNotification = JSON.parse(body)
    
    // 新規作成のみ通知
    if (payload.type.toLowerCase() !== 'insert') {
      console.log('❌ Not an insert operation:', payload.type)
      return new Response(
        JSON.stringify({ message: 'Not a new booking' }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    }

    console.log('✅ Processing insert operation')
    const booking = payload.record
    console.log('📋 Booking data:', {
      id: booking.id,
      customer_name: booking.customer_name,
      scenario_title: booking.scenario_title,
      reservation_source: booking.reservation_source
    })
    
    // 候補日時フィールド
    const candidateFields = booking.candidate_datetimes.candidates.map(c => {
      const date = new Date(c.date)
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}(${['日','月','火','水','木','金','土'][date.getDay()]})`
      return {
        name: `候補${c.order}`,
        value: `${dateStr} ${c.timeSlot} ${c.startTime}-${c.endTime}`,
        inline: true
      }
    })
    
    // 希望店舗
    const storesText = booking.candidate_datetimes.requestedStores
      ?.map(s => s.storeName)
      .join(', ') || '全店舗'
    
    // ボタンコンポーネント
    const buttons = {
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 3, // Success (緑)
          label: '✅ 出勤可能な日程を選択',
          custom_id: `gm_available_${booking.id}`
        },
        {
          type: 2, // Button
          style: 4, // Danger (赤)
          label: '❌ 全て出勤不可',
          custom_id: `gm_unavailable_${booking.id}`
        }
      ]
    }
    
    console.log('🚀 Sending Discord notification...')
    console.log('Discord Channel ID:', DISCORD_CHANNEL_ID)
    console.log('Discord Bot Token (first 10 chars):', DISCORD_BOT_TOKEN?.substring(0, 10) + '...')
    
    // Discordに通知を送信
    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: '@here 新規貸切リクエストが届きました！',
          embeds: [{
            title: '🎭 新規貸切リクエスト',
            color: 0x9333ea, // 紫
            fields: [
              {
                name: '📋 シナリオ',
                value: booking.scenario_title || booking.title || 'シナリオ名不明',
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
              text: '下のボタンから回答してください'
            },
            timestamp: new Date(booking.created_at).toISOString()
          }],
          components: [buttons]
        })
      }
    )
    
    console.log('Discord response status:', discordResponse.status)
    
    if (!discordResponse.ok) {
      const errorText = await discordResponse.text()
      console.error('❌ Discord notification failed:', errorText)
      console.error('Response status:', discordResponse.status)
      console.error('Response headers:', Object.fromEntries(discordResponse.headers))
      throw new Error(`Discord API error: ${errorText}`)
    }

    const responseData = await discordResponse.json()
    console.log('✅ Discord notification sent successfully!')
    console.log('Message ID:', responseData.id)

    return new Response(
      JSON.stringify({ 
        message: 'Notification sent successfully',
        booking_id: booking.id,
        message_id: responseData.id
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

