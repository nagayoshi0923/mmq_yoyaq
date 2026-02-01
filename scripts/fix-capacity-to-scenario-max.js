#!/usr/bin/env node

/**
 * capacityをシナリオの最大参加人数（player_count_max）に合わせるスクリプト
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

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixCapacityToScenarioMax() {
  try {
    console.log('capacityをシナリオの最大参加人数に合わせる処理を開始...')
    
    // 中止でない全公演を取得（シナリオ情報も含む）
    const { data: events, error: eventsError } = await supabase
      .from('schedule_events')
      .select(`
        id, 
        date, 
        scenario, 
        capacity, 
        current_participants,
        scenario_id,
        scenarios!inner(
          id,
          title,
          player_count_max
        )
      `)
      .eq('is_cancelled', false)
      .not('scenario_id', 'is', null)
    
    if (eventsError) {
      console.error('公演データの取得に失敗:', eventsError)
      return
    }
    
    console.log(`処理対象の公演数: ${events?.length || 0}件`)
    
    if (!events || events.length === 0) {
      console.log('処理対象の公演はありません')
      return
    }
    
    let fixedCount = 0
    let skippedCount = 0
    
    for (const event of events) {
      try {
        const scenario = event.scenarios
        if (!scenario || !scenario.player_count_max) {
          console.log(`⏭️  シナリオ情報が不足: ${event.scenario} (${event.date})`)
          skippedCount++
          continue
        }
        
        const scenarioMaxParticipants = scenario.player_count_max
        const currentCapacity = event.capacity
        
        // capacityがシナリオの最大参加人数と異なる場合のみ修正
        if (currentCapacity !== scenarioMaxParticipants) {
          // 現在の参加者数を確認
          const { data: reservations, error: reservationError } = await supabase
            .from('reservations')
            .select('participant_count')
            .eq('schedule_event_id', event.id)
            .in('status', ['confirmed', 'pending'])
          
          if (reservationError) {
            console.error(`予約データの取得に失敗 (${event.id}):`, reservationError)
            continue
          }
          
          const currentParticipants = reservations?.reduce((sum, reservation) => 
            sum + (reservation.participant_count || 0), 0) || 0
          
          // capacityをシナリオの最大参加人数に設定
          const { error: updateError } = await supabase
            .from('schedule_events')
            .update({ 
              capacity: scenarioMaxParticipants,
              current_participants: currentParticipants
            })
            .eq('id', event.id)
          
          if (updateError) {
            console.error(`capacity修正エラー (${event.id}):`, updateError)
          } else {
            console.log(`✅ capacity修正: ${event.scenario} (${event.date}) - capacity: ${currentCapacity} -> ${scenarioMaxParticipants}, 参加者: ${currentParticipants}`)
            fixedCount++
          }
        } else {
          console.log(`⏭️  既に正しいcapacity: ${event.scenario} (${event.date}) - capacity: ${currentCapacity}`)
          skippedCount++
        }
      } catch (error) {
        console.error(`capacity修正エラー (${event.id}):`, error)
      }
    }
    
    console.log(`\ncapacity修正完了: ${fixedCount}件`)
    console.log(`スキップ: ${skippedCount}件`)
    
    // 修正後の状況を確認
    console.log('\n修正後の状況確認...')
    const { data: afterEvents, error: afterError } = await supabase
      .from('schedule_events')
      .select(`
        id, 
        date, 
        scenario, 
        capacity,
        scenarios!inner(
          title,
          player_count_max
        )
      `)
      .eq('is_cancelled', false)
      .not('scenario_id', 'is', null)
      .limit(10)
    
    if (afterError) {
      console.error('修正後の確認に失敗:', afterError)
    } else {
      console.log('修正後のcapacity例:')
      afterEvents?.forEach(event => {
        const scenario = event.scenarios
        const isCorrect = event.capacity === scenario?.player_count_max
        const status = isCorrect ? '✅' : '❌'
        console.log(`${status} ${event.scenario} (${event.date}): capacity=${event.capacity}, シナリオ最大=${scenario?.player_count_max}`)
      })
    }
    
    console.log('\n🎉 capacity修正が完了しました!')
    
  } catch (error) {
    console.error('capacity修正でエラー:', error)
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  fixCapacityToScenarioMax()
    .then(() => {
      console.log('\n✅ 処理が完了しました!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error)
      process.exit(1)
    })
}

export { fixCapacityToScenarioMax }
