/**
 * 過去の貸切予約にschedule_event_idを紐付けるスクリプト
 * 
 * 使用方法:
 * deno run --allow-net --allow-env --allow-read scripts/link_private_booking_reservations.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('環境変数が設定されていません: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  Deno.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface ReservationData {
  id: string
  reservation_number?: string
  scenario_id?: string
  store_id?: string
  candidate_datetimes?: {
    candidates: Array<{
      order: number
      date: string
      startTime: string
      endTime: string
      status: string
    }>
    confirmedStore?: {
      storeId: string
      storeName: string
    }
  }
  scenario_title?: string
  title?: string
  status: string
}

interface ScheduleEventData {
  id: string
  date: string
  start_time: string
  end_time: string
  store_id?: string
  venue: string
  scenario: string
}

async function linkPrivateBookings() {
  console.log('🔍 未紐付けの貸切予約を検索中...')

  // 貸切予約で未紐付けのものを取得
  const { data: reservations, error: reservationsError } = await supabase
    .from('reservations')
    .select(`
      id,
      reservation_number,
      scenario_id,
      store_id,
      candidate_datetimes,
      scenario_title,
      title,
      status,
      scenarios:scenario_id(title)
    `)
    .eq('reservation_source', 'web_private')
    .in('status', ['confirmed', 'gm_confirmed'])
    .is('schedule_event_id', null)

  if (reservationsError) {
    console.error('❌ 予約データ取得エラー:', reservationsError)
    Deno.exit(1)
  }

  if (!reservations || reservations.length === 0) {
    console.log('✅ 紐付けが必要な貸切予約はありません')
    return
  }

  console.log(`📋 ${reservations.length}件の未紐付け貸切予約が見つかりました`)

  let linkedCount = 0
  let notFoundCount = 0
  let errorCount = 0

  for (const reservation of reservations as ReservationData[]) {
    try {
      // 確定日時を取得
      const candidateDatetimes = reservation.candidate_datetimes
      if (!candidateDatetimes?.candidates) {
        console.log(`⚠️  予約 ${reservation.id}: candidate_datetimesがありません`)
        notFoundCount++
        continue
      }

      // 確定済みの候補を探す
      const confirmedCandidate = candidateDatetimes.candidates.find(
        (c: any) => c.status === 'confirmed'
      )

      if (!confirmedCandidate) {
        console.log(`⚠️  予約 ${reservation.id}: 確定済み候補がありません`)
        notFoundCount++
        continue
      }

      const eventDate = confirmedCandidate.date
      const startTime = confirmedCandidate.startTime
      const endTime = confirmedCandidate.endTime

      if (!eventDate || !startTime || !endTime) {
        console.log(`⚠️  予約 ${reservation.id}: 日時情報が不完全です`)
        notFoundCount++
        continue
      }

      // 店舗IDを取得
      const storeId = reservation.store_id || 
                     candidateDatetimes.confirmedStore?.storeId || 
                     null

      if (!storeId) {
        console.log(`⚠️  予約 ${reservation.id}: 店舗IDがありません`)
        notFoundCount++
        continue
      }

      // シナリオ名を取得
      const scenarioTitle = reservation.scenario_title || 
                           reservation.title || 
                           (reservation.scenarios as any)?.title || 
                           null

      if (!scenarioTitle) {
        console.log(`⚠️  予約 ${reservation.id}: シナリオ名がありません`)
        notFoundCount++
        continue
      }

      // 店舗情報を取得（venue名の取得用）
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', storeId)
        .single()

      const storeName = storeData?.name || '店舗不明'

      // schedule_eventsから一致するものを検索
      // マッチング条件: date, start_time, end_time, store_id が一致
      const { data: scheduleEvents, error: eventsError } = await supabase
        .from('schedule_events')
        .select('id, date, start_time, end_time, store_id, venue, scenario')
        .eq('date', eventDate)
        .eq('start_time', startTime)
        .eq('end_time', endTime)
        .eq('store_id', storeId)
        .eq('is_cancelled', false)

      if (eventsError) {
        console.error(`❌ 予約 ${reservation.id}: schedule_events検索エラー:`, eventsError)
        errorCount++
        continue
      }

      // シナリオ名でも絞り込み（複数マッチする場合のため）
      let matchedEvent = scheduleEvents?.find((e: ScheduleEventData) => {
        return e.scenario === scenarioTitle || 
               e.venue === storeName
      })

      // それでも見つからない場合は最初のマッチを使う
      if (!matchedEvent && scheduleEvents && scheduleEvents.length > 0) {
        matchedEvent = scheduleEvents[0]
      }

      if (!matchedEvent) {
        console.log(`⚠️  予約 ${reservation.id} (${reservation.reservation_number}): 一致するschedule_eventが見つかりません`)
        console.log(`   日時: ${eventDate} ${startTime}-${endTime}, 店舗ID: ${storeId}, シナリオ: ${scenarioTitle}`)
        notFoundCount++
        continue
      }

      // schedule_event_idを紐付け
      const { error: updateError } = await supabase
        .from('reservations')
        .update({ schedule_event_id: matchedEvent.id })
        .eq('id', reservation.id)

      if (updateError) {
        console.error(`❌ 予約 ${reservation.id}: 紐付けエラー:`, updateError)
        errorCount++
        continue
      }

      console.log(`✅ 予約 ${reservation.id} (${reservation.reservation_number}) を schedule_event ${matchedEvent.id} に紐付けました`)
      linkedCount++

    } catch (error) {
      console.error(`❌ 予約 ${reservation.id}: 処理エラー:`, error)
      errorCount++
    }
  }

  console.log('\n📊 処理結果:')
  console.log(`   ✅ 紐付け成功: ${linkedCount}件`)
  console.log(`   ⚠️  見つからず: ${notFoundCount}件`)
  console.log(`   ❌ エラー: ${errorCount}件`)
}

// 実行
linkPrivateBookings()
  .then(() => {
    console.log('\n✨ 処理が完了しました')
    Deno.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error)
    Deno.exit(1)
  })

