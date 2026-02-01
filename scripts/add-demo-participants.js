#!/usr/bin/env node

/**
 * 中止でない全公演にデモ参加者を満席まで追加するスクリプト
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// 環境変数を読み込み
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseKey) {
  console.error('❌ Supabase key が未設定です。SUPABASE_PUBLISHABLE_KEY（推奨）を設定してください。')
  process.exit(1)
}
if (String(supabaseKey).startsWith('eyJ')) {
  console.error('❌ Legacy JWT API keys は無効化されています。sb_publishable_... を使用してください。')
  process.exit(1)
}

console.log('Supabase URL:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseKey)

async function addDemoParticipantsToAllActiveEvents() {
  try {
    console.log('中止でない全公演にデモ参加者を追加開始...')
    
    // 中止でない全公演を取得
    const { data: events, error: eventsError } = await supabase
      .from('schedule_events')
      .select('*')
      .eq('is_cancelled', false)
      .order('date', { ascending: true })
    
    if (eventsError) {
      console.error('公演データの取得に失敗:', eventsError)
      return { success: false, error: eventsError }
    }
    
    if (!events || events.length === 0) {
      console.log('中止でない公演が見つかりません')
      return { success: true, message: '中止でない公演が見つかりません' }
    }
    
    console.log(`${events.length}件の公演にデモ参加者を追加します`)
    
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0
    
    for (const event of events) {
      try {
        // このイベントの現在の予約データを取得
        const { data: reservations, error: reservationError } = await supabase
          .from('reservations')
          .select('participant_count, participant_names')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        if (reservationError) {
          console.error(`予約データの取得に失敗 (${event.id}):`, reservationError)
          errorCount++
          continue
        }
        
        // 現在の参加者数を計算
        const currentParticipants = reservations?.reduce((sum, reservation) => 
          sum + (reservation.participant_count || 0), 0) || 0
        
        // デモ参加者が既に存在するかチェック
        const hasDemoParticipant = reservations?.some(r => 
          r.participant_names?.includes('デモ参加者') || 
          r.participant_names?.some(name => name.includes('デモ'))
        )
        
        // store_idが無効な場合はスキップ
        if (event.store_id === 'MCRO' || event.store_id === 'null' || !event.store_id) {
          console.log(`⏭️  store_idが無効: ${event.scenario} (${event.date}) - store_id: ${event.store_id}`)
          continue
        }
        
        // scenario_idが無効な場合はデフォルト参加費を使用
        let scenario = null
        let participationFee = 1000 // デフォルト参加費
        
        if (event.scenario_id && event.scenario_id !== 'MCRO' && event.scenario_id !== 'null') {
          const { data: scenarioData, error: scenarioError } = await supabase
            .from('scenarios')
            .select('id, title, duration, participation_fee, gm_test_participation_fee')
            .eq('id', event.scenario_id)
            .single()
          
          if (!scenarioError) {
            scenario = scenarioData
            // デモ参加者の参加費を計算
            const isGmTest = event.category === 'gmtest'
            participationFee = isGmTest 
              ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 1000)
              : (scenario?.participation_fee || 1000)
          } else {
            console.log(`⚠️  シナリオ情報取得失敗、デフォルト参加費使用: ${event.scenario} (${event.date}) - scenario_id: ${event.scenario_id}`)
          }
        } else {
          console.log(`⚠️  scenario_idが無効、デフォルト参加費使用: ${event.scenario} (${event.date}) - scenario_id: ${event.scenario_id}`)
        }
        
        // 満席でない場合、またはデモ参加者がいない場合は追加
        if (currentParticipants < event.capacity && !hasDemoParticipant) {
          
          // 満席まで必要なデモ参加者数を計算
          const neededParticipants = event.capacity - currentParticipants
          
          // デモ参加者の予約を作成
          console.log(`🔍 デバッグ: 公演ID=${event.id}, store_id=${event.store_id}, scenario_id=${event.scenario_id}`)
          console.log(`🔍 デバッグ: gms=${JSON.stringify(event.gms)}`)
          
          const demoReservation = {
            reservation_number: `DEMO-${event.id}-${Date.now()}`, // 必須フィールド
            schedule_event_id: null, // スキーマ不整合のため一時的にnullに設定
            title: event.scenario || '',
            scenario_id: (event.scenario_id && event.scenario_id !== 'null' && event.scenario_id !== 'MCRO') ? event.scenario_id : null,
            store_id: (event.store_id && event.store_id !== 'null' && event.store_id !== 'MCRO') ? event.store_id : null,
            customer_id: null,
            customer_notes: `デモ参加者${neededParticipants}名`,
            requested_datetime: `${event.date}T${event.start_time}+09:00`,
            duration: scenario?.duration || 120,
            participant_count: neededParticipants,
            participant_names: Array(neededParticipants).fill(null).map((_, i) => `デモ参加者${i + 1}`),
            assigned_staff: [], // デモ参加者にはスタッフを割り当てない
            base_price: participationFee * neededParticipants,
            options_price: 0,
            total_price: participationFee * neededParticipants,
            discount_amount: 0,
            final_price: participationFee * neededParticipants,
            payment_method: 'onsite',
            payment_status: 'paid',
            status: 'confirmed',
            reservation_source: 'demo'
          }
          
          console.log(`🔍 デバッグ: demoReservation=${JSON.stringify(demoReservation, null, 2)}`)
          
          // デモ参加者の予約を作成
          const { error: insertError } = await supabase
            .from('reservations')
            .insert(demoReservation)
          
          if (insertError) {
            console.error(`デモ参加者の予約作成に失敗 (${event.id}):`, insertError)
            console.error(`失敗した公演詳細: ${event.scenario} (${event.date}), store_id: ${event.store_id}, scenario_id: ${event.scenario_id}`)
            errorCount++
            continue
          }
          
          // schedule_eventsのcurrent_participantsを更新
          await supabase
            .from('schedule_events')
            .update({ current_participants: event.capacity })
            .eq('id', event.id)
          
          console.log(`✅ デモ参加者${neededParticipants}名を追加: ${event.scenario} (${event.date})`)
          successCount++
        } else if (hasDemoParticipant) {
          console.log(`⏭️  既にデモ参加者が存在: ${event.scenario} (${event.date})`)
          skippedCount++
        } else {
          console.log(`⏭️  既に満席: ${event.scenario} (${event.date})`)
          skippedCount++
        }
      } catch (error) {
        console.error(`❌ デモ参加者の追加に失敗 (${event.id}):`, error)
        errorCount++
      }
    }
    
    console.log('\n=== 処理結果 ===')
    console.log(`✅ 成功: ${successCount}件`)
    console.log(`⏭️  スキップ: ${skippedCount}件`)
    console.log(`❌ エラー: ${errorCount}件`)
    console.log(`📊 合計: ${events.length}件`)
    
    return {
      success: true,
      message: `デモ参加者追加完了: 成功${successCount}件, スキップ${skippedCount}件, エラー${errorCount}件`,
      successCount,
      skippedCount,
      errorCount
    }
  } catch (error) {
    console.error('デモ参加者追加処理でエラー:', error)
    return { success: false, error }
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  addDemoParticipantsToAllActiveEvents()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 処理が完了しました!')
        process.exit(0)
      } else {
        console.error('\n💥 処理に失敗しました:', result.error)
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error)
      process.exit(1)
    })
}

export { addDemoParticipantsToAllActiveEvents }
