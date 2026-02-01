// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, sanitizeErrorMessage, errorResponse, getServiceRoleKey, isCronOrServiceRoleCall } from '../_shared/security.ts'

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // CORSプリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔒 Cron/システム呼び出しのみ許可（誤爆・悪用防止）
    if (!isCronOrServiceRoleCall(req)) {
      return errorResponse('Unauthorized', 401, corsHeaders)
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      getServiceRoleKey(), // Service Role / Secret Key を使用
    )

    // 現在の日時
    const now = new Date()
    
    // リマインダー送信設定を取得（デフォルトは3日前）
    const reminderDaysBefore = 3
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + reminderDaysBefore)
    const targetDateStr = targetDate.toISOString().split('T')[0]

    console.log(`リマインダー送信対象日: ${targetDateStr}`)

    // 対象日の予約を取得
    const { data: scheduleEvents, error: eventsError } = await supabaseClient
      .from('schedule_events')
      .select(`
        *,
        stores:store_id (
          id,
          name,
          address
        ),
        scenarios:scenario_id (
          id,
          title
        )
      `)
      .eq('date', targetDateStr)
      .eq('is_cancelled', false)
      .eq('is_reservation_enabled', true)

    if (eventsError) throw eventsError

    if (!scheduleEvents || scheduleEvents.length === 0) {
      console.log('対象日に公演がありません')
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '対象日に公演がありません',
          count: 0 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log(`対象公演数: ${scheduleEvents.length}`)

    let totalSent = 0
    let totalErrors = 0

    // 各公演の予約者にリマインダーを送信（通常予約・貸切予約を含む）
    for (const event of scheduleEvents) {
      try {
        // 該当公演の予約を取得
        // デバッグ: まず全ての予約を確認（ステータス問わず）
        const { data: allReservations, error: allResError } = await supabaseClient
          .from('reservations')
          .select('id, schedule_event_id, status, customer_id, requested_datetime')
          .eq('schedule_event_id', event.id)

        if (allResError) {
          console.error(`公演 ${event.id} の予約取得エラー:`, allResError)
        } else if (allReservations && allReservations.length > 0) {
          console.log(`公演 ${event.id} の全予約数: ${allReservations.length}`, JSON.stringify(allReservations.map(r => ({ id: r.id, status: r.status, schedule_event_id: r.schedule_event_id }))))
        } else {
          console.log(`公演 ${event.id} にはschedule_event_idで紐付けられた予約がありません`)
        }

        // 該当公演の予約を取得（confirmed/pendingのみ）
        // ステータスを拡張: gm_confirmedなども含める
        const { data: reservations, error: resError } = await supabaseClient
          .from('reservations')
          .select('*, customers(*)')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending', 'gm_confirmed'])

        if (resError) throw resError

        if (!reservations || reservations.length === 0) {
          console.log(`公演 ${event.id} に予約がありません（confirmed/pendingの予約のみ）`)
          continue
        }

        console.log(`公演 ${event.id} の予約数: ${reservations.length}`)

        // 各予約者にリマインダーメールを送信
        for (const reservation of reservations) {
          if (!reservation.customers || !reservation.customers.email) {
            console.log(`予約 ${reservation.id} に顧客情報がありません`)
            continue
          }

          try {
            const { error: sendError } = await supabaseClient.functions.invoke('send-reminder-emails', {
              body: {
                reservationId: reservation.id,
                customerEmail: reservation.customers.email,
                customerName: reservation.customers.name,
                scenarioTitle: event.scenarios?.title || event.scenario,
                eventDate: event.date,
                startTime: event.start_time,
                endTime: event.end_time,
                storeName: event.stores?.name || event.venue,
                storeAddress: event.stores?.address,
                participantCount: reservation.participant_count,
                totalPrice: reservation.total_price || 0,
                reservationNumber: reservation.reservation_number,
                daysBefore: reminderDaysBefore  // 3日前なので3を渡す
              }
            })

            if (sendError) {
              console.error(`リマインダーメール送信エラー (予約ID: ${reservation.id}):`, sendError)
              totalErrors++
            } else {
              console.log(`リマインダーメール送信成功 (予約ID: ${reservation.id})`)
              totalSent++
            }
          } catch (emailError) {
            console.error(`リマインダーメール送信エラー (予約ID: ${reservation.id}):`, emailError)
            totalErrors++
          }
        }
      } catch (error) {
        console.error(`公演 ${event.id} の処理中にエラー:`, error)
        totalErrors++
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `リマインダーメール送信完了`,
        targetDate: targetDateStr,
        eventsCount: scheduleEvents.length,
        totalSent,
        totalErrors
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error:', sanitizeErrorMessage(msg))
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: sanitizeErrorMessage(msg || 'リマインダーメール送信に失敗しました') 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

