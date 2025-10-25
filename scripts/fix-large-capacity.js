#!/usr/bin/env node

/**
 * capacityが8より大きい公演を8に修正するスクリプト
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// 環境変数を読み込み
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixLargeCapacity() {
  try {
    console.log('capacityが8より大きい公演を修正開始...')
    
    // capacityが8より大きい公演を取得
    const { data: largeCapacityEvents, error: largeCapacityError } = await supabase
      .from('schedule_events')
      .select('id, date, scenario, capacity, current_participants')
      .gt('capacity', 8)
      .eq('is_cancelled', false)
    
    if (largeCapacityError) {
      console.error('large capacity公演の取得に失敗:', largeCapacityError)
      return
    }
    
    console.log(`capacityが8より大きい公演数: ${largeCapacityEvents?.length || 0}件`)
    
    if (!largeCapacityEvents || largeCapacityEvents.length === 0) {
      console.log('修正対象の公演はありません')
      return
    }
    
    let fixedCount = 0
    
    for (const event of largeCapacityEvents) {
      try {
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
        
        // capacityを8に修正（現在の参加者数が8を超えている場合は現在の参加者数に設定）
        const newCapacity = Math.max(8, currentParticipants)
        
        const { error: updateError } = await supabase
          .from('schedule_events')
          .update({ 
            capacity: newCapacity,
            current_participants: currentParticipants
          })
          .eq('id', event.id)
        
        if (updateError) {
          console.error(`capacity修正エラー (${event.id}):`, updateError)
        } else {
          console.log(`✅ capacity修正: ${event.scenario} (${event.date}) - capacity: ${event.capacity} → ${newCapacity}, 参加者: ${currentParticipants}`)
          fixedCount++
        }
      } catch (error) {
        console.error(`capacity修正エラー (${event.id}):`, error)
      }
    }
    
    console.log(`\ncapacity修正完了: ${fixedCount}件`)
    
    // 修正後の状況を確認
    console.log('\n修正後の状況確認...')
    const { data: afterEvents, error: afterError } = await supabase
      .from('schedule_events')
      .select('id, date, scenario, capacity, current_participants')
      .gt('capacity', 8)
      .eq('is_cancelled', false)
      .limit(5)
    
    if (afterError) {
      console.error('修正後の確認に失敗:', afterError)
    } else {
      console.log(`修正後もcapacityが8より大きい公演数: ${afterEvents?.length || 0}件`)
      if (afterEvents && afterEvents.length > 0) {
        console.log('修正後もcapacityが8より大きい公演例:')
        afterEvents.forEach(event => {
          console.log(`  - ${event.scenario} (${event.date}): capacity=${event.capacity}, 参加者=${event.current_participants}`)
        })
      }
    }
    
    console.log('\n🎉 capacity修正が完了しました!')
    
  } catch (error) {
    console.error('capacity修正でエラー:', error)
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  fixLargeCapacity()
    .then(() => {
      console.log('\n✅ 処理が完了しました!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error)
      process.exit(1)
    })
}

export { fixLargeCapacity }
