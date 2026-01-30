#!/usr/bin/env node

/**
 * サンプルオープン公演データの挿入スクリプト
 * 
 * 使い方:
 * node scripts/insert_sample_open_events.js
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// 環境変数を読み込み
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ エラー: 環境変数が設定されていません')
  console.error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env ファイルに設定してください')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function insertSampleOpenEvents() {
  console.log('🚀 サンプルオープン公演の挿入を開始します...\n')

  try {
    // 1. 既存のサンプルデータを削除
    console.log('📝 既存のサンプルデータを削除中...')
    const { error: deleteError } = await supabase
      .from('schedule_events')
      .delete()
      .eq('category', 'open')
      .like('notes', '%サンプルデータ%')

    if (deleteError) {
      console.warn('⚠️  削除時の警告:', deleteError.message)
    } else {
      console.log('✅ 既存のサンプルデータを削除しました\n')
    }

    // 2. 店舗データを取得
    console.log('📍 店舗データを取得中...')
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name, short_name')
      .eq('status', 'active')
      .limit(3)

    if (storesError) throw storesError
    if (!stores || stores.length === 0) {
      throw new Error('店舗データが見つかりません。先に店舗を登録してください。')
    }
    console.log(`✅ ${stores.length} 件の店舗を取得しました`)

    // 3. シナリオデータを取得
    console.log('📚 シナリオデータを取得中...')
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title, duration, player_count_max')
      .eq('status', 'available')
      .limit(10)

    if (scenariosError) throw scenariosError
    if (!scenarios || scenarios.length === 0) {
      throw new Error('シナリオデータが見つかりません。先にシナリオを登録してください。')
    }
    console.log(`✅ ${scenarios.length} 件のシナリオを取得しました\n`)

    // 4. オープン公演を作成
    console.log('🎭 オープン公演を作成中...')
    const events = []
    const today = new Date()
    
    // 今日から30日間の範囲で公演を作成
    for (let dayOffset = 3; dayOffset <= 30; dayOffset += 2) {
      for (const store of stores) {
        // ランダムにシナリオを選択
        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]
        
        // ランダムな開始時刻（10時〜18時）
        const startHour = 10 + Math.floor(Math.random() * 9)
        const startTime = `${String(startHour).padStart(2, '0')}:00:00`
        
        // 終了時刻を計算（シナリオの所要時間を考慮）
        const durationHours = Math.ceil(scenario.duration / 60)
        const endHour = startHour + durationHours
        const endTime = `${String(endHour).padStart(2, '0')}:00:00`
        
        // 公演日
        const eventDate = new Date(today)
        eventDate.setDate(today.getDate() + dayOffset)
        const dateStr = eventDate.toISOString().split('T')[0]
        
        events.push({
          date: dateStr,
          store_id: store.id,
          scenario_id: scenario.id,
          category: 'open',
          start_time: startTime,
          end_time: endTime,
          capacity: scenario.player_count_max,
          max_participants: scenario.player_count_max,
          current_participants: 0,
          is_cancelled: false,
          is_reservation_enabled: true,
          reservation_deadline_hours: 0,
          reservation_notes: '当日は開始時刻の10分前までにお越しください。',
          notes: 'サンプルデータ: 予約サイトテスト用',
          gms: []
        })
        
        // 最大30件まで
        if (events.length >= 30) break
      }
      if (events.length >= 30) break
    }

    // 5. データを挿入
    console.log(`📥 ${events.length} 件の公演を挿入中...`)
    const { data: insertedEvents, error: insertError } = await supabase
      .from('schedule_events')
      .insert(events)
      .select()

    if (insertError) throw insertError
    
    console.log(`✅ ${insertedEvents.length} 件の公演を作成しました\n`)

    // 6. 結果を表示
    console.log('📊 作成された公演の統計:')
    console.log(`   総数: ${insertedEvents.length} 件`)
    console.log(`   期間: ${events[0].date} 〜 ${events[events.length - 1].date}`)
    console.log(`   店舗数: ${stores.length} 店舗`)
    console.log(`   シナリオ数: ${new Set(events.map(e => e.scenario_id)).size} 種類\n`)

    // 7. 確認クエリ
    console.log('🔍 予約サイトで表示される公演を確認中...')
    const { data: viewableEvents, error: viewError } = await supabase
      .from('schedule_events')
      .select(`
        date,
        start_time,
        stores:store_id (name),
        scenarios:scenario_id (title)
      `)
      .eq('category', 'open')
      .eq('is_reservation_enabled', true)
      .eq('is_cancelled', false)
      .gte('date', today.toISOString().split('T')[0])
      .like('notes', '%サンプルデータ%')
      .order('date')
      .order('start_time')
      .limit(10)

    if (viewError) throw viewError

    console.log(`✅ ${viewableEvents.length} 件の公演が予約サイトで表示可能です\n`)
    
    console.log('📋 最初の5件:')
    viewableEvents.slice(0, 5).forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.date} ${event.start_time} - ${event.stores?.name} - ${event.scenarios?.title}`)
    })

    console.log('\n✨ サンプルデータの挿入が完了しました！')
    console.log('🌐 ブラウザで http://localhost:5173/ を開いて「予約サイト」タブを確認してください\n')

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// スクリプトを実行
insertSampleOpenEvents()
