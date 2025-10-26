import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function AddDemoParticipants() {
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' | 'skip' }>>([])
  const [isRunning, setIsRunning] = useState(false)

  const log = (message: string, type: 'info' | 'success' | 'error' | 'skip' = 'info') => {
    setLogs(prev => [...prev, { message, type }])
  }

  const addDemoParticipants = async () => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    
    let successCount = 0
    let failedCount = 0
    let skippedCount = 0
    
    try {
      // Supabase接続確認
      log('Supabase接続確認中...', 'info')
      const { data: testData, error: testError } = await supabase
        .from('customers')
        .select('count')
        .limit(1)
      
      if (testError) {
        log(`接続エラー: ${testError.message}`, 'error')
        log(`エラー詳細: ${JSON.stringify(testError)}`, 'error')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      log('✅ Supabase接続成功', 'success')
      
      // デモ顧客を取得
      log('デモ顧客を検索中...', 'info')
      
      // まず全顧客を取得してデバッグ
      const { data: allCustomers, error: allError } = await supabase
        .from('customers')
        .select('id, name, email')
        .limit(10)
      
      if (allError) {
        log(`顧客取得エラー: ${allError.message}`, 'error')
      } else {
        log(`顧客リスト (最初の10件):`, 'info')
        allCustomers?.forEach(c => {
          log(`  - ${c.name} (${c.email || 'メールなし'})`, 'info')
        })
      }
      
      const { data: demoCustomer, error: customerError } = await supabase
        .from('customers')
        .select('id, name, email')
        .or('name.ilike.%デモ%,email.ilike.%demo%,name.ilike.%test%')
        .limit(1)
        .single()
      
      if (customerError || !demoCustomer) {
        log('デモ顧客が見つかりません。上記の顧客リストから選択してください。', 'error')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      log(`デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`, 'success')
      
      // 今日以前の公演を取得
      log('公演を取得中...', 'info')
      const { data: pastEvents, error: eventsError } = await supabase
        .from('schedule_events')
        .select('id, date, venue, scenario, gms, start_time, end_time, category, is_cancelled, current_participants, capacity')
        .lte('date', today.toISOString().split('T')[0])
        .eq('is_cancelled', false)
        .in('category', ['open', 'gmtest'])
        .order('date', { ascending: false })
      
      if (eventsError) {
        log('公演取得エラー', 'error')
        throw eventsError
      }
      
      if (!pastEvents || pastEvents.length === 0) {
        log('対象の公演がありません', 'skip')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      log(`対象公演: ${pastEvents.length}件`, 'info')
      
      for (const event of pastEvents) {
        const currentParticipants = event.current_participants || 0
        const maxParticipants = event.capacity || 8
        
        if (currentParticipants >= maxParticipants) {
          skippedCount++
          continue
        }
        
        // 既存のデモ予約チェック
        const { data: existingReservations } = await supabase
          .from('reservations')
          .select('id, participant_names, reservation_source')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        const hasDemoParticipant = existingReservations?.some(r => 
          r.reservation_source === 'demo_auto' ||
          !r.participant_names || 
          r.participant_names.length === 0
        )
        
        if (hasDemoParticipant) {
          skippedCount++
          continue
        }
        
        const shortfall = maxParticipants - currentParticipants
        
        if (!event.scenario || event.scenario.trim() === '') {
          log(`⏭️  シナリオ名が空 [${event.date}]`, 'skip')
          skippedCount++
          continue
        }

        const { data: scenario } = await supabase
          .from('scenarios')
          .select('id, title, duration, participation_fee, gm_test_participation_fee')
          .eq('title', event.scenario.trim())
          .maybeSingle()
        
        if (!scenario) {
          log(`⏭️  シナリオ未登録 [${event.scenario}]`, 'skip')
          skippedCount++
          continue
        }
        
        const isGmTest = event.category === 'gmtest'
        const participationFee = isGmTest 
          ? (scenario.gm_test_participation_fee || scenario.participation_fee || 0)
          : (scenario.participation_fee || 0)
        
        const { data: store } = await supabase
          .from('stores')
          .select('id')
          .or(`name.eq.${event.venue},short_name.eq.${event.venue}`)
          .single()
        
        if (!store) {
          log(`❌ 店舗ID取得エラー [${event.venue}]`, 'error')
          failedCount++
          continue
        }
        
        let durationMinutes = 120
        if (scenario.duration) {
          const parsed = parseInt(String(scenario.duration), 10)
          if (!isNaN(parsed) && parsed > 0) {
            durationMinutes = parsed
          }
        }

        const demoReservation = {
          schedule_event_id: event.id,
          title: event.scenario || '',
          scenario_id: scenario.id || null,
          store_id: store.id || null,
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
          log(`❌ エラー [${event.date} ${event.scenario}]: ${insertError.message}`, 'error')
          failedCount++
        } else {
          log(`✅ 追加成功: ${event.date} ${event.scenario} (${shortfall}名追加)`, 'success')
          successCount++
        }
      }
      
      return { success: successCount, failed: failedCount, skipped: skippedCount }
    } catch (error: any) {
      log(`エラー: ${error.message}`, 'error')
      return { success: successCount, failed: failedCount, skipped: skippedCount }
    }
  }

  const handleStart = async () => {
    setIsRunning(true)
    setLogs([])
    log('処理を開始します...', 'info')
    
    try {
      const result = await addDemoParticipants()
      log('━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
      log(`処理完了: 成功 ${result.success}件, スキップ ${result.skipped}件, 失敗 ${result.failed}件`, 'info')
      log('━━━━━━━━━━━━━━━━━━━━━━━━', 'info')
    } catch (error: any) {
      log(`エラー: ${error.message}`, 'error')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="p-8">
          <h1 className="text-2xl font-bold mb-4">📋 デモ参加者追加ツール</h1>
          <p className="text-gray-600 mb-6">
            今日以前の中止になっていない公演で、定員に達していない公演にデモ参加者を追加します。
          </p>
          
          <Button 
            onClick={handleStart} 
            disabled={isRunning}
            className="mb-6"
          >
            {isRunning ? '処理中...' : 'デモ参加者を追加'}
          </Button>
          
          {logs.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-96 overflow-y-auto font-mono text-sm">
              {logs.map((log, index) => (
                <div 
                  key={index} 
                  className={`mb-1 ${
                    log.type === 'success' ? 'text-green-600' :
                    log.type === 'error' ? 'text-red-600' :
                    log.type === 'skip' ? 'text-gray-500' :
                    'text-blue-600'
                  }`}
                >
                  {log.message}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

