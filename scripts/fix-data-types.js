#!/usr/bin/env node

/**
 * データベースのstore_idとscenario_idを修正するスクリプト
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// 環境変数を読み込み
dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cznpcewciwywcqcxktba.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bnBjZXdjaXd5d2NxY3hrdGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MzMyMjAsImV4cCI6MjA3NDIwOTIyMH0.GBR1kO877s6iy1WmVXL4xY8wpsyAdmgsXKEQbm0MNLo'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixDataTypes() {
  try {
    console.log('データベースの型エラーを修正開始...')
    
    // 有効な店舗IDを取得
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .order('name')
    
    if (storesError) {
      console.error('店舗データの取得に失敗:', storesError)
      return
    }
    
    console.log(`有効な店舗数: ${stores?.length || 0}件`)
    if (stores && stores.length > 0) {
      console.log('店舗例:', stores.slice(0, 3))
    }
    
    // 有効なシナリオIDを取得
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, title')
      .order('title')
      .limit(10)
    
    if (scenariosError) {
      console.error('シナリオデータの取得に失敗:', scenariosError)
      return
    }
    
    console.log(`有効なシナリオ数: ${scenarios?.length || 0}件`)
    if (scenarios && scenarios.length > 0) {
      console.log('シナリオ例:', scenarios.slice(0, 3))
    }
    
    // デフォルトの店舗ID（最初の店舗を使用）
    const defaultStoreId = stores && stores.length > 0 ? stores[0].id : null
    const defaultScenarioId = scenarios && scenarios.length > 0 ? scenarios[0].id : null
    
    console.log(`デフォルト店舗ID: ${defaultStoreId}`)
    console.log(`デフォルトシナリオID: ${defaultScenarioId}`)
    
    // store_idが'MCRO'の公演を修正
    if (defaultStoreId) {
      console.log('\nstore_idを修正中...')
      
      // まず、store_idが文字列の公演を取得（UUIDでないもの）
      const { data: invalidStoreEvents, error: invalidStoreError } = await supabase
        .from('schedule_events')
        .select('id, date, scenario, store_id')
        .not('store_id', 'is', null)
        .limit(100)
      
      if (invalidStoreError) {
        console.error('無効なstore_idの取得に失敗:', invalidStoreError)
      } else {
        console.log(`確認対象の公演数: ${invalidStoreEvents?.length || 0}件`)
        
        let fixedStoreCount = 0
        for (const event of invalidStoreEvents || []) {
          // UUID形式でないstore_idを修正
          if (event.store_id && !event.store_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            try {
              const { error: updateError } = await supabase
                .from('schedule_events')
                .update({ store_id: defaultStoreId })
                .eq('id', event.id)
              
              if (updateError) {
                console.error(`store_id修正エラー (${event.id}):`, updateError)
              } else {
                console.log(`✅ store_id修正: ${event.scenario} (${event.date})`)
                fixedStoreCount++
              }
            } catch (error) {
              console.error(`store_id修正エラー (${event.id}):`, error)
            }
          }
        }
        console.log(`store_id修正完了: ${fixedStoreCount}件`)
      }
    }
    
    // scenario_idが'MCRO'の公演を修正
    if (defaultScenarioId) {
      console.log('\nscenario_idを修正中...')
      
      // まず、scenario_idが文字列の公演を取得（UUIDでないもの）
      const { data: invalidScenarioEvents, error: invalidScenarioError } = await supabase
        .from('schedule_events')
        .select('id, date, scenario, scenario_id')
        .not('scenario_id', 'is', null)
        .limit(100)
      
      if (invalidScenarioError) {
        console.error('無効なscenario_idの取得に失敗:', invalidScenarioError)
      } else {
        console.log(`確認対象の公演数: ${invalidScenarioEvents?.length || 0}件`)
        
        let fixedScenarioCount = 0
        for (const event of invalidScenarioEvents || []) {
          // UUID形式でないscenario_idを修正
          if (event.scenario_id && !event.scenario_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            try {
              const { error: updateError } = await supabase
                .from('schedule_events')
                .update({ scenario_id: defaultScenarioId })
                .eq('id', event.id)
              
              if (updateError) {
                console.error(`scenario_id修正エラー (${event.id}):`, updateError)
              } else {
                console.log(`✅ scenario_id修正: ${event.scenario} (${event.date})`)
                fixedScenarioCount++
              }
            } catch (error) {
              console.error(`scenario_id修正エラー (${event.id}):`, error)
            }
          }
        }
        console.log(`scenario_id修正完了: ${fixedScenarioCount}件`)
      }
    }
    
    console.log('\n🎉 データ型修正が完了しました!')
    
  } catch (error) {
    console.error('データ型修正でエラー:', error)
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  fixDataTypes()
    .then(() => {
      console.log('\n✅ 処理が完了しました!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 予期しないエラー:', error)
      process.exit(1)
    })
}

export { fixDataTypes }
