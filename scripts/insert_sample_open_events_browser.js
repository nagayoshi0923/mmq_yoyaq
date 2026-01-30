/**
 * ブラウザのコンソールで実行するサンプルデータ挿入スクリプト
 * 
 * 使い方:
 * 1. ブラウザで http://localhost:5173/ を開く
 * 2. 開発者ツールのコンソールを開く (F12)
 * 3. このファイルの内容をコピー&ペーストして実行
 */

(async function insertSampleOpenEvents() {
  console.log('🚀 サンプルオープン公演の挿入を開始します...\n')

  try {
    // supabaseクライアントを取得（グローバルに存在する想定）
    const { supabase } = await import('/src/lib/supabase.ts')
    
    if (!supabase) {
      throw new Error('Supabaseクライアントが見つかりません')
    }

    // 1. 既存のサンプルデータを削除
    console.log('📝 既存のサンプルデータを削除中...')
    await supabase
      .from('schedule_events')
      .delete()
      .eq('category', 'open')
      .like('notes', '%サンプルデータ%')

    console.log('✅ 既存のサンプルデータを削除しました\n')

    // 2. 店舗データを取得
    console.log('📍 店舗データを取得中...')
    const { data: stores } = await supabase
      .from('stores')
      .select('id, name, short_name')
      .eq('status', 'active')
      .limit(3)

    if (!stores || stores.length === 0) {
      throw new Error('店舗データが見つかりません')
    }
    console.log(`✅ ${stores.length} 件の店舗を取得しました`)

    // 3. シナリオデータを取得
    console.log('📚 シナリオデータを取得中...')
    const { data: scenarios } = await supabase
      .from('scenarios')
      .select('id, title, duration, player_count_max')
      .eq('status', 'available')
      .limit(10)

    if (!scenarios || scenarios.length === 0) {
      throw new Error('シナリオデータが見つかりません')
    }
    console.log(`✅ ${scenarios.length} 件のシナリオを取得しました\n`)

    // 4. オープン公演を作成
    console.log('🎭 オープン公演を作成中...')
    const events = []
    const today = new Date()
    
    for (let dayOffset = 3; dayOffset <= 30; dayOffset += 2) {
      for (const store of stores) {
        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]
        const startHour = 10 + Math.floor(Math.random() * 9)
        const startTime = `${String(startHour).padStart(2, '0')}:00:00`
        const durationHours = Math.ceil(scenario.duration / 60)
        const endHour = startHour + durationHours
        const endTime = `${String(endHour).padStart(2, '0')}:00:00`
        
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
        
        if (events.length >= 30) break
      }
      if (events.length >= 30) break
    }

    // 5. データを挿入
    console.log(`📥 ${events.length} 件の公演を挿入中...`)
    const { data: insertedEvents, error } = await supabase
      .from('schedule_events')
      .insert(events)
      .select()

    if (error) throw error
    
    console.log(`✅ ${insertedEvents.length} 件の公演を作成しました\n`)
    console.log('✨ サンプルデータの挿入が完了しました！')
    console.log('🔄 ページをリロードして「予約サイト」タブを確認してください\n')
    
    // ページをリロード
    setTimeout(() => {
      window.location.reload()
    }, 2000)

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message)
    console.error(error)
  }
})()
