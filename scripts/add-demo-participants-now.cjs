const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// .envファイルから環境変数を読み込む（簡易実装）
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        process.env[key] = value
      }
    })
  }
}

loadEnv()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function addDemoParticipantsToPastUnderfullEvents() {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  
  let successCount = 0
  let failedCount = 0
  let skippedCount = 0
  
  try {
    // デモ顧客を取得
    console.log('デモ顧客を検索中...')
    const { data: demoCustomer, error: customerError } = await supabase
      .from('customers')
      .select('id, name')
      .or('name.ilike.%デモ%,email.ilike.%demo%')
      .limit(1)
      .single()
    
    if (customerError || !demoCustomer) {
      console.error('❌ デモ顧客が見つかりません:', customerError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    console.log(`✅ デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`)
    
    // 今日以前の公演を取得
    console.log('\n今日以前の公演を取得中...')
    const { data: pastEvents, error: eventsError } = await supabase
      .from('schedule_events')
      .select(`
        id,
        date,
        venue,
        scenario,
        gms,
        start_time,
        end_time,
        category,
        is_cancelled,
        current_participants,
        capacity
      `)
      .lte('date', today.toISOString().split('T')[0])
      .eq('is_cancelled', false)
      .in('category', ['open', 'gmtest'])
      .order('date', { ascending: false })
    
    if (eventsError) {
      console.error('❌ 公演取得エラー:', eventsError)
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    if (!pastEvents || pastEvents.length === 0) {
      console.log('対象の公演がありません')
      return { success: 0, failed: 0, skipped: 0 }
    }
    
    console.log(`対象公演: ${pastEvents.length}件\n`)
    
    for (const event of pastEvents) {
      const currentParticipants = event.current_participants || 0
      const maxParticipants = event.capacity || 8
      
      // 定員に達している場合はスキップ
      if (currentParticipants >= maxParticipants) {
        skippedCount++
        continue
      }
      
      // 既存のデモ予約チェック
      const { data: existingReservations, error: reservationCheckError } = await supabase
        .from('reservations')
        .select('id, participant_names, reservation_source')
        .eq('schedule_event_id', event.id)
        .in('status', ['confirmed', 'pending'])
      
      if (reservationCheckError) {
        console.error('予約チェックエラー:', reservationCheckError)
        failedCount++
        continue
      }
      
      const hasDemoParticipant = existingReservations?.some(r => 
        r.reservation_source === 'demo_auto' ||
        !r.participant_names || 
        r.participant_names.length === 0 ||
        r.participant_names?.includes('デモ参加者') || 
        r.participant_names?.some(name => name.includes('デモ'))
      )
      
      if (hasDemoParticipant) {
        skippedCount++
        continue
      }
      
      // 不足人数を計算
      const shortfall = maxParticipants - currentParticipants
      
      // シナリオ情報を取得
      if (!event.scenario || event.scenario.trim() === '') {
        console.log(`⏭️  シナリオ名が空 [${event.id}]`)
        skippedCount++
        continue
      }

      const { data: scenario, error: scenarioError } = await supabase
        .from('scenarios')
        .select('id, title, duration, participation_fee, gm_test_participation_fee')
        .eq('title', event.scenario.trim())
        .maybeSingle()
      
      if (scenarioError) {
        console.error(`❌ シナリオ取得エラー [${event.scenario}]:`, scenarioError)
        failedCount++
        continue
      }

      if (!scenario) {
        console.log(`⏭️  シナリオ未登録 [${event.scenario}]`)
        skippedCount++
        continue
      }
      
      // 参加費を計算
      const isGmTest = event.category === 'gmtest'
      const participationFee = isGmTest 
        ? (scenario?.gm_test_participation_fee || scenario?.participation_fee || 0)
        : (scenario?.participation_fee || 0)
      
      // 店舗IDを取得
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .or(`name.eq.${event.venue},short_name.eq.${event.venue}`)
        .single()
      
      if (storeError) {
        console.error(`❌ 店舗ID取得エラー [${event.venue}]:`, storeError)
        failedCount++
        continue
      }
      
      // durationを数値に変換
      let durationMinutes = 120
      if (scenario?.duration) {
        const parsed = parseInt(String(scenario.duration), 10)
        if (!isNaN(parsed) && parsed > 0) {
          durationMinutes = parsed
        }
      }

      // デモ参加者の予約を作成
      const demoReservation = {
        schedule_event_id: event.id,
        title: event.scenario || '',
        scenario_id: scenario?.id || null,
        store_id: store?.id || null,
        customer_id: demoCustomer.id,
        customer_notes: `デモ参加者（自動追加） - ${shortfall}名`,
        requested_datetime: `${event.date}T${event.start_time}+09:00`,
        duration: durationMinutes,
        participant_count: shortfall,
        participant_names: [],
        assigned_staff: event.gms || [],
        base_price: participationFee * shortfall,
        options_price: 0,
        total_price: participationFee * shortfall,
        discount_amount: 0,
        final_price: participationFee * shortfall,
        payment_method: 'onsite',
        payment_status: 'paid',
        status: 'confirmed',
        reservation_source: 'demo_auto'
      }
      
      const { error: insertError } = await supabase
        .from('reservations')
        .insert(demoReservation)
      
      if (insertError) {
        console.error(`❌ エラー [${event.date} ${event.scenario}]:`, insertError)
        failedCount++
      } else {
        console.log(`✅ 追加成功: ${event.date} ${event.scenario} (${shortfall}名追加)`)
        successCount++
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`処理完了`)
    console.log(`成功: ${successCount}件`)
    console.log(`スキップ: ${skippedCount}件`)
    console.log(`失敗: ${failedCount}件`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  } catch (error) {
    console.error('処理エラー:', error)
    return { success: successCount, failed: failedCount, skipped: skippedCount }
  }
}

// 実行
addDemoParticipantsToPastUnderfullEvents()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('致命的エラー:', error)
    process.exit(1)
  })

