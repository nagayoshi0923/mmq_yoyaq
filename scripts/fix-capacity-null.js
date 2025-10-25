#!/usr/bin/env node

/**
 * capacityがnullの公演を修正するスクリプト
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// 環境変数を読み込み
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixCapacityNull() {
  try {
    console.log('capacityがnullの公演を修正開始...')
    
    // capacityがnullの公演を取得
    const { data: nullCapacityEvents, error: nullCapacityError } = await supabase
      .from('schedule_events')
      .select('id, date, scenario, capacity, current_participants')
      .is('capacity', null)
      .eq('is_cancelled', false)
    
    if (nullCapacityError) {
      console.error('capacityがnullの公演の取得に失敗:', nullCapacityError)
      return
    }
    
    console.log(`capacityがnullの公演数: ${nullCapacityEvents?.length || 0}件`)
    
    if (!nullCapacityEvents || nullCapacityEvents.length === 0) {
      console.log('修正対象の公演はありません')
      return
    }
    
    // デフォルトのcapacity（8人）を設定
    const defaultCapacity = 8
    let fixedCount = 0
    
    for (const event of nullCapacityEvents) {
      try {
        // この公演の現在の参加者数を確認
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
        
        // capacityを更新（現在の参加者数より大きくする）
        const newCapacity = Math.max(defaultCapacity, currentParticipants)
        
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
          console.log(`✅ capacity修正: ${event.scenario} (${event.date}) - capacity: ${newCapacity}, 参加者: ${currentParticipants}`)
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
      .is('capacity', null)
      .eq('is_cancelled', false)
      .limit(5)
    
    if (afterError) {
      console.error('修正後の確認に失敗:', afterError)
    } else {
      console.log(`修正後もcapacityがnullの公演数: ${afterEvents?.length || 0}件`)
    }
    
    console.log('\n🎉 capacity修正が完了しました!')
    
  } catch (error) {
    console.error('capacity修正でエラー:', error)
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  fixCapacityNull()
    .then(() => {
      console.log('\n✅ 処理が完了しました!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error)
      process.exit(1)
    })
}

export { fixCapacityNull }
