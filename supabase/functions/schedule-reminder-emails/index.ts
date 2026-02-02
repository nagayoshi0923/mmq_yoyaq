import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAnonKey, getServiceRoleKey, getCorsHeaders, maskEmail, verifyAuth, errorResponse, isCronOrServiceRoleCall } from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 P0修正: 認証チェック追加（cron/Service Role または管理者のみ許可）
    const isCronCall = isCronOrServiceRoleCall(req)
    if (!isCronCall) {
      const authResult = await verifyAuth(req, ['admin', 'owner', 'license_admin'])
      if (!authResult.success) {
        return errorResponse(authResult.error!, authResult.statusCode!, corsHeaders)
      }
    }

    // Service Roleクライアントを使用（予約情報を全て取得するため）
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey()
    )

    // 現在の日時を取得
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // リマインドメール設定を取得
    const { data: emailSettings, error: settingsError } = await supabaseClient
      .from('email_settings')
      .select('reminder_enabled, reminder_schedule, company_name, company_phone, company_email')
      .eq('store_id', 'default') // デフォルト設定を使用
      .maybeSingle()

    if (settingsError) {
      console.error('メール設定取得エラー:', settingsError)
      return new Response(
        JSON.stringify({ success: false, error: 'メール設定の取得に失敗しました' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    if (!emailSettings?.reminder_enabled || !emailSettings.reminder_schedule) {
      console.log('リマインドメールが無効または設定されていません')
      return new Response(
        JSON.stringify({ success: true, message: 'リマインドメールが無効です' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 有効なリマインドスケジュールをフィルタリング
    const activeSchedules = emailSettings.reminder_schedule.filter(
      schedule => schedule.enabled
    )

    if (activeSchedules.length === 0) {
      console.log('有効なリマインドスケジュールがありません')
      return new Response(
        JSON.stringify({ success: true, message: '有効なリマインドスケジュールがありません' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 各スケジュールに対して処理
    const results = []
    for (const schedule of activeSchedules) {
      const targetDate = new Date(now)
      targetDate.setDate(now.getDate() + schedule.days_before)
      const targetDateStr = targetDate.toISOString().split('T')[0]

      // 該当日の予約を取得
      const { data: reservations, error: reservationsError } = await supabaseClient
        .from('reservations')
        .select(`
          id,
          reservation_number,
          customer_name,
          customer_email,
          participant_count,
          total_price,
          schedule_events!inner(
            id,
            date,
            start_time,
            end_time,
            scenario,
            venue,
            stores!inner(name, address)
          )
        `)
        .eq('schedule_events.date', targetDateStr)
        .eq('status', 'confirmed')
        .not('customer_email', 'is', null)

      if (reservationsError) {
        console.error(`予約取得エラー (${schedule.days_before}日前):`, reservationsError)
        continue
      }

      if (!reservations || reservations.length === 0) {
        console.log(`${schedule.days_before}日前の予約はありません`)
        continue
      }

      // 各予約に対してリマインドメールを送信
      for (const reservation of reservations) {
        try {
          const event = reservation.schedule_events
          const store = event.stores

          // リマインドメール送信（Service Role Keyを使用して認証）
          const reminderResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-reminder-emails`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${getServiceRoleKey()}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              reservationId: reservation.id,
              customerEmail: reservation.customer_email,
              customerName: reservation.customer_name,
              scenarioTitle: event.scenario,
              eventDate: event.date,
              startTime: event.start_time,
              endTime: event.end_time,
              storeName: store.name,
              storeAddress: store.address,
              participantCount: reservation.participant_count,
              totalPrice: reservation.total_price,
              reservationNumber: reservation.reservation_number,
              daysBefore: schedule.days_before,
              template: schedule.template
            }),
          })

          if (reminderResponse.ok) {
            const result = await reminderResponse.json()
            console.log(`リマインドメール送信成功: ${maskEmail(reservation.customer_email)}`)
            results.push({
              reservationId: reservation.id,
              daysBefore: schedule.days_before,
              success: true
            })
          } else {
            const error = await reminderResponse.text()
            console.error(`リマインドメール送信失敗: ${maskEmail(reservation.customer_email)}`, error)
            results.push({
              reservationId: reservation.id,
              daysBefore: schedule.days_before,
              success: false,
              error: error
            })
          }
        } catch (error) {
          console.error(`リマインドメール送信エラー: ${maskEmail(reservation.customer_email)}`, error)
          results.push({
            reservationId: reservation.id,
            daysBefore: schedule.days_before,
            success: false,
            error: error.message
          })
        }
      }
    }

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`リマインドメール処理完了: 成功 ${successCount}件, 失敗 ${failureCount}件`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `リマインドメール処理完了: 成功 ${successCount}件, 失敗 ${failureCount}件`,
        results: results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('リマインドメールスケジューラーエラー:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
