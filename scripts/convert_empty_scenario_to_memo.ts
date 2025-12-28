/**
 * シナリオが未記入の公演をMEMOに変換するスクリプト
 * 
 * 処理内容:
 * 1. シナリオが空（null, '', または未登録シナリオ）の公演を検索
 * 2. その公演の情報（日付、店舗、備考など）をdaily_memosテーブルに保存
 * 3. 元の公演を削除（または無効化）
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

// ESM用の__dirname代替
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// .env.local を読み込む
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function convertEmptyScenarioToMemo() {
  console.log('🔍 シナリオ未記入の公演を検索中...')
  
  // シナリオが空またはnullの公演を取得
  const { data: emptyScenarioEvents, error: fetchError } = await supabase
    .from('schedule_events')
    .select(`
      id,
      date,
      venue,
      store_id,
      scenario,
      scenario_id,
      notes,
      gms,
      start_time,
      end_time,
      category,
      is_cancelled
    `)
    .or('scenario.is.null,scenario.eq.')
    .order('date', { ascending: true })
  
  if (fetchError) {
    console.error('❌ 公演取得エラー:', fetchError)
    return
  }
  
  console.log(`📊 シナリオ未記入の公演: ${emptyScenarioEvents?.length || 0}件`)
  
  if (!emptyScenarioEvents || emptyScenarioEvents.length === 0) {
    console.log('✅ 変換対象の公演はありません')
    return
  }
  
  // プレビュー表示
  console.log('\n📋 変換対象の公演:')
  for (const event of emptyScenarioEvents.slice(0, 20)) {
    const gmInfo = event.gms?.length ? `GM: ${event.gms.join(', ')}` : 'GM未設定'
    const notesInfo = event.notes ? `備考: ${event.notes.substring(0, 30)}...` : '備考なし'
    console.log(`  - ${event.date} ${event.venue} | ${gmInfo} | ${notesInfo}`)
  }
  if (emptyScenarioEvents.length > 20) {
    console.log(`  ... 他 ${emptyScenarioEvents.length - 20}件`)
  }
  
  // 確認
  console.log('\n⚠️ これらの公演をMEMOに変換しますか？')
  console.log('  - 公演情報はdaily_memosテーブルに移動されます')
  console.log('  - 元の公演は削除されます')
  console.log('\n実行するには --execute フラグを付けてください')
  
  if (!process.argv.includes('--execute')) {
    return
  }
  
  console.log('\n🚀 変換を開始します...')
  
  let convertedCount = 0
  let deletedCount = 0
  const errors: string[] = []
  
  // 日付と店舗でグループ化
  const memoMap = new Map<string, { date: string; storeId: string; venue: string; texts: string[] }>()
  
  for (const event of emptyScenarioEvents) {
    const key = `${event.date}_${event.store_id}`
    
    if (!memoMap.has(key)) {
      memoMap.set(key, { date: event.date, storeId: event.store_id, venue: event.venue, texts: [] })
    }
    
    // メモテキストを作成
    const parts: string[] = []
    if (event.start_time || event.end_time) {
      parts.push(`[${event.start_time || '?'}-${event.end_time || '?'}]`)
    }
    if (event.gms?.length) {
      parts.push(`GM: ${event.gms.join(', ')}`)
    }
    if (event.notes) {
      parts.push(event.notes)
    }
    if (event.category && event.category !== 'open') {
      parts.push(`(${event.category})`)
    }
    if (event.is_cancelled) {
      parts.push('【中止】')
    }
    
    if (parts.length > 0) {
      memoMap.get(key)!.texts.push(parts.join(' '))
    }
  }
  
  // daily_memosに保存
  for (const [key, memoData] of memoMap.entries()) {
    if (!memoData.storeId || memoData.texts.length === 0) continue
    
    try {
      // 既存のメモを取得
      const { data: existingMemo } = await supabase
        .from('daily_memos')
        .select('memo_text')
        .eq('date', memoData.date)
        .eq('venue_id', memoData.storeId)
        .single()
      
      const existingText = existingMemo?.memo_text || ''
      const newText = memoData.texts.join('\n')
      const combinedText = existingText ? `${existingText}\n${newText}` : newText
      
      // 保存（UPSERT）
      const { error } = await supabase
        .from('daily_memos')
        .upsert({
          date: memoData.date,
          venue_id: memoData.storeId,
          memo_text: combinedText,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'date,venue_id'
        })
      
      if (error) {
        errors.push(`MEMO保存エラー (${memoData.date} ${memoData.venue}): ${error.message}`)
      } else {
        console.log(`✅ MEMO保存: ${memoData.date} ${memoData.venue}`)
        convertedCount++
      }
    } catch (error) {
      errors.push(`MEMO保存エラー (${memoData.date} ${memoData.venue}): ${error}`)
    }
  }
  
  // 元の公演を削除
  console.log('\n🗑️ 元の公演を削除中...')
  const eventIds = emptyScenarioEvents.map(e => e.id)
  
  // まず関連する予約を削除
  const { error: reservationDeleteError } = await supabase
    .from('reservations')
    .delete()
    .in('schedule_event_id', eventIds)
  
  if (reservationDeleteError) {
    console.error('❌ 予約削除エラー:', reservationDeleteError)
  }
  
  // 公演を削除
  const { error: deleteError } = await supabase
    .from('schedule_events')
    .delete()
    .in('id', eventIds)
  
  if (deleteError) {
    console.error('❌ 公演削除エラー:', deleteError)
    errors.push(`公演削除エラー: ${deleteError.message}`)
  } else {
    deletedCount = eventIds.length
    console.log(`✅ ${deletedCount}件の公演を削除しました`)
  }
  
  // 結果表示
  console.log('\n📊 結果:')
  console.log(`  - MEMO変換: ${convertedCount}件`)
  console.log(`  - 公演削除: ${deletedCount}件`)
  if (errors.length > 0) {
    console.log(`  - エラー: ${errors.length}件`)
    errors.forEach(e => console.log(`    - ${e}`))
  }
}

convertEmptyScenarioToMemo()

