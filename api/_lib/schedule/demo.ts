// api/schedule.ts のデモ参加者の追加と削除（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { ACTIVE_RESERVATION_STATUSES, getOrgScenarioPlayerCounts, resolveMaxParticipants } from './common.js'

// ─── handleAddDemoParticipants (POST action=add-demo-participants) ───────
export async function handleAddDemoParticipants(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db!

  // 中止でない自組織の全公演を取得
  const { data: events, error: eventsError } = await database
    .from('schedule_events')
    .select('id, organization_id, scenario_master_id, scenario, store_id, date, start_time, category, gms, capacity, max_participants')
    .eq('is_cancelled', false)
    .eq('organization_id', user.orgId)
    .order('date', { ascending: true })

  if (eventsError) {
    console.error('[schedule:add-demo] events fetch error:', eventsError)
    return res.status(500).json({ error: '公演データの取得に失敗しました', detail: eventsError.message })
  }
  if (!events || events.length === 0) {
    return res.status(200).json({ success: true, message: '中止でない公演が見つかりません', successCount: 0, errorCount: 0 })
  }

  const orgScenarioMap = await getOrgScenarioPlayerCounts(user.orgId)
  let successCount = 0
  let errorCount = 0

  for (const event of events as Array<Record<string, unknown> & { id: string; scenario_master_id: string | null; organization_id: string; scenario: string | null; store_id: string | null; date: string; start_time: string; category: string; gms: string[] | null; capacity: number | null; max_participants: number | null }>) {
    try {
      const { data: reservations, error: reservationError } = await database
        .from('reservations')
        .select('participant_count, participant_names')
        .eq('schedule_event_id', event.id)
        .in('status', [...ACTIVE_RESERVATION_STATUSES])
      if (reservationError && reservationError.code !== 'PGRST116') {
        errorCount++
        continue
      }

      const reservedParticipants = ((reservations as Array<{ participant_count: number | null; participant_names: string[] | null }> | null) ?? [])
        .reduce((sum, r) => sum + (r.participant_count || 0), 0)

      const capacity = resolveMaxParticipants(
        { scenario_master_id: event.scenario_master_id, scenario: event.scenario, max_participants: event.max_participants, capacity: event.capacity },
        orgScenarioMap,
      )

      const hasDemoParticipant = ((reservations as Array<{ participant_names: string[] | null }> | null) ?? []).some(r =>
        r.participant_names?.some((name: string) => typeof name === 'string' && name.includes('デモ')),
      )

      const neededParticipants = capacity - reservedParticipants
      if (neededParticipants <= 0 || hasDemoParticipant) continue
      if (!event.scenario_master_id) continue

      const { data: scenarioMaster, error: masterError } = await database
        .from('scenario_masters')
        .select('id, title, official_duration')
        .eq('id', event.scenario_master_id)
        .single()
      if (masterError) { errorCount++; continue }

      const { data: orgScenario } = await database
        .from('organization_scenarios')
        .select('participation_fee, gm_test_participation_fee')
        .eq('scenario_master_id', event.scenario_master_id)
        .eq('organization_id', user.orgId)
        .maybeSingle()

      const isGmTest = event.category === 'gmtest'
      const participationFee = isGmTest
        ? ((orgScenario as { gm_test_participation_fee?: number; participation_fee?: number } | null)?.gm_test_participation_fee
          || (orgScenario as { participation_fee?: number } | null)?.participation_fee
          || 0)
        : ((orgScenario as { participation_fee?: number } | null)?.participation_fee || 0)

      const demoReservation: Record<string, unknown> = {
        schedule_event_id: event.id,
        organization_id: user.orgId, // ← サーバ強制
        title: event.scenario || (scenarioMaster as { title?: string } | null)?.title || '',
        scenario_master_id: event.scenario_master_id,
        store_id: event.store_id || null,
        customer_id: null,
        customer_notes: neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${neededParticipants}名`,
        requested_datetime: `${event.date}T${event.start_time}+09:00`,
        duration: (scenarioMaster as { official_duration?: number } | null)?.official_duration || 120,
        participant_count: neededParticipants,
        participant_names: Array(neededParticipants).fill(null).map((_, i) =>
          neededParticipants === 1 ? 'デモ参加者' : `デモ参加者${i + 1}`,
        ),
        assigned_staff: event.gms || [],
        base_price: participationFee * neededParticipants,
        options_price: 0,
        total_price: participationFee * neededParticipants,
        discount_amount: 0,
        final_price: participationFee * neededParticipants,
        payment_method: 'onsite',
        payment_status: 'paid',
        status: 'confirmed',
        reservation_source: 'demo',
      }

      const { error: insertError } = await database
        .from('reservations')
        .insert(demoReservation)
      if (insertError) { errorCount++; continue }

      // 参加者数を予約テーブルから再計算して schedule_events を更新
      const { data: allReservations, error: allResError } = await database
        .from('reservations')
        .select('participant_count')
        .eq('schedule_event_id', event.id)
        .in('status', [...ACTIVE_RESERVATION_STATUSES])
      if (!allResError) {
        const totalParticipants = ((allReservations as Array<{ participant_count: number | null }> | null) ?? [])
          .reduce((sum, r) => sum + (r.participant_count || 0), 0)
        await database
          .from('schedule_events')
          .update({ current_participants: totalParticipants })
          .eq('id', event.id)
          .eq('organization_id', user.orgId)
      }

      successCount++
    } catch (err) {
      console.error(`[schedule:add-demo] event ${event.id} error:`, err)
      errorCount++
    }
  }

  return res.status(200).json({
    success: true,
    message: `デモ参加者追加完了: 成功${successCount}件, エラー${errorCount}件`,
    successCount,
    errorCount,
  })
}

// ─── handleRemoveDemoReservations (POST action=remove-demo-reservations) ─
export async function handleRemoveDemoReservations(_req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const database = db!

  // RPC は SECURITY DEFINER だが、自組織のデモ予約のみを削除するため、
  // ここでは手動で対象を絞ってから DELETE する（org スコープを強制）。
  const { data, error } = await database
    .from('reservations')
    .delete()
    .eq('reservation_source', 'demo')
    .eq('organization_id', user.orgId)
    .select('id')

  if (error) {
    console.error('[schedule:remove-demo] DB error:', error)
    return res.status(500).json({ error: 'デモ予約の削除に失敗しました', detail: error.message })
  }
  const deletedCount = Array.isArray(data) ? data.length : 0
  return res.status(200).json({ success: true, deletedCount })
}
