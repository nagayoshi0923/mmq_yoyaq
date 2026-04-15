import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { sanitizeForPostgRestFilter } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useOrganization } from '@/hooks/useOrganization'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function AddDemoParticipants() {
  const { user } = useAuth()
  const { organizationId } = useOrganization()
  const [logs, setLogs] = useState<Array<{ message: string; type: 'info' | 'success' | 'error' | 'skip' }>>([])
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    if (!user) {
      setLogs([{ message: '⚠️ ログインが必要です。ログインページにリダイレクトします...', type: 'error' }])
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    }
  }, [user])

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
      const { error: testError } = await supabase
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
      
      // まず全顧客を取得してデバッグ（組織フィルタ付き）
      let allCustQuery = supabase
        .from('customers')
        .select('id, name, email')
      if (organizationId) {
        allCustQuery = allCustQuery.eq('organization_id', organizationId)
      }
      const { data: allCustomers, error: allError } = await allCustQuery.limit(10)
      
      if (allError) {
        log(`顧客取得エラー: ${allError.message}`, 'error')
      } else {
        log(`顧客リスト (最初の10件):`, 'info')
        allCustomers?.forEach(c => {
          log(`  - ${c.name} (${c.email || 'メールなし'})`, 'info')
        })
      }
      
      let demoCustQuery = supabase
        .from('customers')
        .select('id, name, email')
        .or('name.ilike.%デモ%,email.ilike.%demo%,name.ilike.%test%')
      if (organizationId) {
        demoCustQuery = demoCustQuery.eq('organization_id', organizationId)
      }
      const { data: demoCustomer, error: customerError } = await demoCustQuery
        .limit(1)
        .single()
      
      if (customerError || !demoCustomer) {
        log('デモ顧客が見つかりません。上記の顧客リストから選択してください。', 'error')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      log(`デモ顧客: ${demoCustomer.name} (ID: ${demoCustomer.id})`, 'success')
      
      // 今日以前の公演を取得（全カテゴリ対象、組織フィルタ付き）
      log('公演を取得中（全カテゴリ）...', 'info')
      let eventsQuery = supabase
        .from('schedule_events_staff_view')
        .select('id, date, venue, scenario, scenario_master_id, gms, start_time, end_time, category, is_cancelled, current_participants, capacity, organization_id')
        .lte('date', today.toISOString().split('T')[0])
        .eq('is_cancelled', false)
      if (organizationId) {
        eventsQuery = eventsQuery.eq('organization_id', organizationId)
      }
      const { data: pastEvents, error: eventsError } = await eventsQuery
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
      
      // 全シナリオを事前に取得（organization_scenarios_with_master: 組織固有の participation_fee）
      log('シナリオマスタを取得中...', 'info')
      let scenariosQuery = supabase
        .from('organization_scenarios_with_master')
        .select('id, title, duration, participation_fee, gm_test_participation_fee, player_count_max, player_count_min')
      if (organizationId) {
        scenariosQuery = scenariosQuery.eq('organization_id', organizationId)
      }
      const { data: allScenarios, error: scenariosError } = await scenariosQuery
      
      if (scenariosError) {
        log(`❌ シナリオ取得エラー: ${scenariosError.message}`, 'error')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      if (!allScenarios || allScenarios.length === 0) {
        log(`❌ シナリオマスタが空です`, 'error')
        return { success: 0, failed: 0, skipped: 0 }
      }
      
      log(`📚 シナリオマスタ: ${allScenarios.length}件読み込み完了`, 'success')
      
      for (const event of pastEvents) {
        const currentParticipants = event.current_participants || 0
        
        // 既存のデモ予約チェック
        const { data: existingReservations } = await supabase
          .from('reservations')
          .select('id, participant_names, reservation_source, participant_count')
          .eq('schedule_event_id', event.id)
          .in('status', ['confirmed', 'pending'])
        
        // デモ参加者の予約を抽出
        const demoReservations = existingReservations?.filter(r =>
          r.reservation_source === RESERVATION_SOURCE.DEMO_AUTO ||
          !r.participant_names || 
          r.participant_names.length === 0
        ) || []
        
        if (!event.scenario || event.scenario.trim() === '') {
          log(`⏭️  シナリオ名が空 [${event.date}]`, 'skip')
          skippedCount++
          continue
        }

        // シナリオ名を正規化（記号や接頭辞を除去）
        let normalizedScenario = event.scenario.trim()
        // 先頭の引用符を削除（複数連続も対応）
        normalizedScenario = normalizedScenario.replace(/^["「『]+/g, '')
        // 絵文字を削除
        normalizedScenario = normalizedScenario.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        // 募・貸・貸切・GMテスト・出張などの接頭辞を削除（引用符込みのパターンも対応）
        normalizedScenario = normalizedScenario.replace(/^["「『]*(募・|貸・|📕貸・|📗貸・|出張・|GMテスト・)+/g, '')
        // 再度先頭の引用符を削除
        normalizedScenario = normalizedScenario.replace(/^["「『]+/g, '')
        // 末尾の引用符も削除
        normalizedScenario = normalizedScenario.replace(/["」』]+$/g, '')
        // 全角スペースを削除（ナナイロの迷宮などの表記揺れ対応）
        normalizedScenario = normalizedScenario.replace(/　/g, '')
        normalizedScenario = normalizedScenario.trim()

        // テストやミーティングなどはスキップ
        const skipKeywords = [
          'MTG', 'マネージャーミーティング', '打ち合わせ', '面接', '歯医者', '清掃', 
          'TOOLS', '箱開け', 'パッケージ会', '打診', '風呂清掃', '練習', 'スタート', 
          'キット', '可能日', '作品未定', '工事予定', '出張', 'GMテスト', 'テストプレイ',
          'テスプ', '体験会', 'ポーカー', '講座', 'インプロ', '未定'
        ]
        if (skipKeywords.some(keyword => normalizedScenario.includes(keyword))) {
          log(`⏭️  対象外 [${event.scenario}]`, 'skip')
          skippedCount++
          continue
        }

        // scenario_master_id があれば ID で検索、なければタイトルで検索
        let scenario: any = null
        
        if (event.scenario_master_id) {
          // ビューの id は scenario_master_id と同一
          let idQuery = supabase
            .from('organization_scenarios_with_master')
            .select('id, title, duration, participation_fee, gm_test_participation_fee, player_count_max, player_count_min')
            .eq('id', event.scenario_master_id)
          if (organizationId) {
            idQuery = idQuery.eq('organization_id', organizationId)
          }
          const { data } = await idQuery.maybeSingle()
          
          scenario = data
        }
        
        // ID がない、または ID で見つからない場合はタイトルで検索
        if (!scenario) {
          // 正規化後も空の場合はスキップ
          if (!normalizedScenario) {
            log(`⏭️  シナリオ名が空 [${event.date}]`, 'skip')
            skippedCount++
            continue
          }

          // 正規化パターン（全角スペース、ハイフン、スペースを除去）
          const searchPattern = normalizedScenario
            .replace(/[-ー]/g, '')
            .replace(/\s+/g, '')
          
          log(`🔍 正規化後: [${searchPattern}] (元: ${event.scenario})`, 'info')
          
          // クライアント側で正規化して比較
          const matchedScenario = allScenarios?.find(s => {
            const normalizedTitle = s.title
              .replace(/　/g, '') // 全角スペース除去
              .replace(/[-ー]/g, '') // ハイフン・長音除去
              .replace(/\s+/g, '') // 半角スペース除去
            
            // デバッグ: 最初の3件だけログ出力
            if (allScenarios.indexOf(s) < 3) {
              log(`  比較: [${normalizedTitle}] vs [${searchPattern}] → ${normalizedTitle === searchPattern}`, 'info')
            }
            
            return normalizedTitle === searchPattern
          })
          
          if (matchedScenario) {
            log(`✅ マッチ成功: ${event.scenario} → ${matchedScenario.title}`, 'success')
            scenario = matchedScenario
          } else {
            // 完全一致しない場合は部分一致を試す
            const partialMatch = allScenarios?.find(s => {
              const normalizedTitle = s.title
                .replace(/　/g, '')
                .replace(/[-ー]/g, '')
                .replace(/\s+/g, '')
              return normalizedTitle.includes(searchPattern) || searchPattern.includes(normalizedTitle)
            })
            
            if (partialMatch) {
              log(`🔍 部分一致: ${event.scenario} → ${partialMatch.title}`, 'info')
              scenario = partialMatch
            } else {
              // 類似シナリオを検索してデバッグ情報を表示（scenario_masters から基本情報）
              const { data: similarScenarios } = await supabase
                .from('scenario_masters')
                .select('title')
                .ilike('title', `%${normalizedScenario.substring(0, 3)}%`)
                .limit(3)
              
              if (similarScenarios && similarScenarios.length > 0) {
                const suggestions = similarScenarios.map(s => s.title).join(', ')
                log(`⏭️  シナリオ未登録 [${event.scenario}] (類似: ${suggestions})`, 'skip')
              } else {
                log(`⏭️  シナリオ未登録 [${event.scenario}]`, 'skip')
              }
              skippedCount++
              continue
            }
          }
        }

        // シナリオの最大参加人数を使用
        const scenarioMaxParticipants = scenario.player_count_max || 8
        
        // デモ参加者を除いた実際の参加者数を計算
        const demoParticipantCount = demoReservations.reduce((sum, r) => sum + (r.participant_count || 0), 0)
        const realParticipants = currentParticipants - demoParticipantCount
        
        // 現在の参加者数（デモ除く）がシナリオの最大参加人数を超えている場合
        if (realParticipants > scenarioMaxParticipants) {
          log(`⚠️  実参加者が最大人数超過 [${event.date} ${event.scenario}] (実${realParticipants}名 > 最大${scenarioMaxParticipants}名)`, 'skip')
          skippedCount++
          continue
        }
        
        // 必要なデモ参加者数を計算
        const neededDemoCount = scenarioMaxParticipants - realParticipants
        
        // 既にデモ参加者がいる場合
        if (demoReservations.length > 0) {
          if (demoParticipantCount === neededDemoCount) {
            // 既に正しい人数のデモ参加者がいる
            log(`✅ デモ参加者適正 [${event.date} ${event.scenario}] (${demoParticipantCount}名)`, 'success')
            skippedCount++
            continue
          } else if (demoParticipantCount > neededDemoCount) {
            // デモ参加者が多すぎる場合、過剰分のみ削除
            const excessCount = demoParticipantCount - neededDemoCount
            let deletedCount = 0
            
            for (const demoRes of demoReservations) {
              if (deletedCount >= excessCount) break
              
              const { error: deleteError } = await supabase.rpc('admin_delete_reservations_by_ids', {
                p_reservation_ids: [demoRes.id]
              })
              
              if (deleteError) {
                log(`❌ デモ予約削除エラー [${event.date} ${event.scenario}]`, 'error')
                failedCount++
              } else {
                deletedCount += demoRes.participant_count || 0
                log(`🗑️  過剰デモ削除: ${event.date} ${event.scenario} (${demoRes.participant_count}名削除)`, 'success')
              }
            }
            
            successCount++
            continue
          }
          // demoParticipantCount < neededDemoCount の場合は下のロジックで不足分を追加
        }
        
        // 追加するデモ参加者数（既存のデモ参加者を考慮）
        const shortfall = neededDemoCount - demoParticipantCount
        
        // デモ参加者が不要な場合はスキップ
        if (shortfall <= 0) {
          skippedCount++
          continue
        }
        
        // カテゴリに応じて参加費を計算
        let participationFee = 0
        if (event.category === 'gmtest') {
          // GMテスト：GM用参加費または通常参加費
          participationFee = scenario.gm_test_participation_fee || scenario.participation_fee || 0
        } else if (event.category === 'private') {
          // 貸切：通常参加費（貸切料金は別計算）
          participationFee = scenario.participation_fee || 0
        } else {
          // open, enterprise, その他：通常参加費
          participationFee = scenario.participation_fee || 0
        }
        
        const safeVenue = sanitizeForPostgRestFilter(event.venue)
        const { data: store } = await supabase
          .from('stores')
          .select('id')
          .or(`name.eq.${safeVenue},short_name.eq.${safeVenue}`)
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

        // 予約番号を自動生成（YYYYMMDD-XXXX形式）
        const date = new Date()
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
        const reservationNumber = `${dateStr}-${randomStr}`
        
        const demoReservation = {
          schedule_event_id: event.id,
          organization_id: event.organization_id,
          reservation_number: reservationNumber,  // 予約番号を明示的に指定
          title: event.scenario || '',
          scenario_master_id: scenario.id || null,
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
          reservation_source: RESERVATION_SOURCE.DEMO_AUTO
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
    if (!user) {
      log('ログインが必要です', 'error')
      return
    }

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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <Card className="p-8">
            <h1 className="text-lg mb-4">📋 デモ参加者追加ツール</h1>
            <p className="text-red-600 mb-6">
              ⚠️ このツールを使用するにはログインが必要です。
            </p>
            {logs.length > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="text-red-600">
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="p-8">
          <h1 className="text-lg mb-4">📋 デモ参加者追加ツール</h1>
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

