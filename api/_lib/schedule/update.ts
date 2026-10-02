// api/schedule.ts の公演の更新（PATCH）（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import { capacityError, isCapacityConstraintError, CAPACITY_CHANGED_MESSAGE } from '../scheduleCapacity.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'
import { DB_VALID_CATEGORIES, SCHEDULE_UPDATABLE_FIELDS, pickFields, removeMissingScheduleColumn, findMatchingScenario, SCHEDULE_EVENT_FULL_SELECT } from './writeHelpers.js'

// ─── handleUpdate (PATCH) ────────────────────────────────────────────────
export async function handleUpdate(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const expectedUpdatedAt = req.query.expected_updated_at as string | undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const database = db as any
  const body = (req.body ?? {}) as Record<string, unknown>
  const updateRow = pickFields(body, SCHEDULE_UPDATABLE_FIELDS)

  if (Object.keys(updateRow).length === 0) {
    return res.status(400).json({ error: '更新可能なフィールドがありません' })
  }

  // 対象イベントが自組織か確認
  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id, store_id, max_participants, capacity, current_participants')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) {
    console.error('[schedule:update] existing lookup error:', existingErr)
    return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  }
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は編集できません' })
  }

  const capacityMessage = capacityError(existing, updateRow.capacity)
  if (capacityMessage) return res.status(409).json({ error: capacityMessage, code: 'CAPACITY_EXCEEDED' })

  // store_id を変える場合、移動先店舗も自組織か確認
  if (typeof updateRow.store_id === 'string' && updateRow.store_id !== existing.store_id) {
    const { data: newStore, error: newStoreErr } = await database
      .from('stores')
      .select('id, organization_id')
      .eq('id', updateRow.store_id)
      .maybeSingle()
    if (newStoreErr) {
      return res.status(500).json({ error: '店舗確認に失敗しました' })
    }
    if (!newStore) return res.status(404).json({ error: '店舗が見つかりません' })
    if (newStore.organization_id !== user.orgId) {
      return res.status(403).json({ error: '他組織の店舗は使用できません' })
    }
  }

  // シナリオ名から自動マッチング
  const scenarioInput = typeof updateRow.scenario === 'string' ? updateRow.scenario : undefined
  if (scenarioInput && !updateRow.scenario_master_id) {
    const match = await findMatchingScenario(scenarioInput)
    if (match) {
      updateRow.scenario_master_id = match.id
      updateRow.scenario = match.title
    }
  }

  // organization_scenario_id を自動設定（scenario_master_id 経由）
  if (updateRow.scenario_master_id && !updateRow.organization_scenario_id) {
    const { data: orgScenario } = await database
      .from('organization_scenarios')
      .select('id')
      .eq('scenario_master_id', updateRow.scenario_master_id as string)
      .eq('organization_id', user.orgId)
      .maybeSingle()
    if (orgScenario?.id) {
      updateRow.organization_scenario_id = orgScenario.id
    }
  }

  if (typeof updateRow.category === 'string' && !DB_VALID_CATEGORIES.includes(updateRow.category)) {
    updateRow.category = 'open'
  }

  let updatePayload: Record<string, unknown> = { ...updateRow, updated_at: new Date().toISOString() }
  let lastError: { message?: string; details?: string; hint?: string; code?: string } | null = null
  let updateSucceeded = false
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let query = database
      .from('schedule_events')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', user.orgId)
    if (expectedUpdatedAt) {
      query = query.eq('updated_at', expectedUpdatedAt)
    }
    const { error } = await query.select('id').single()

    if (!error) {
      updateSucceeded = true
      break
    }
    if (expectedUpdatedAt && error.code === 'PGRST116') {
      return res.status(409).json({ error: '他のユーザーが先にこのイベントを更新しました。ページを再読み込みして最新データを確認してください。' })
    }
    lastError = error
    const removal = removeMissingScheduleColumn(updatePayload, error)
    if (!removal) break
    updatePayload = removal.nextPayload
  }

  if (!updateSucceeded) {
    if (isCapacityConstraintError(lastError)) {
      return res.status(409).json({ error: CAPACITY_CHANGED_MESSAGE, code: 'CAPACITY_EXCEEDED' })
    }
    if (lastError?.code === '55P03') return res.status(409).json({ error: '関連する予約が変更されています。再読み込みしてから保存してください。' })
    if (lastError?.code === '23514') {
      const syncErrors: Record<string, string> = {
        EVENT_BOOKING_ORGANIZATION_MISMATCH: '公演と予約の組織が一致しないため保存できません。関連する予約を確認してください。',
        EVENT_PRIVATE_GROUP_ORGANIZATION_MISMATCH: '予約と貸切グループの対応を確認できないため保存できません。',
        EVENT_PRIVATE_CANDIDATE_AMBIGUOUS: '変更元に一致する貸切候補が複数あります。候補日を確認してから保存してください。',
      }
      return res.status(400).json({ error: syncErrors[lastError.message || ''] || lastError.message })
    }
    console.error('[schedule:update] update error:', lastError)
    return res.status(500).json({ error: '公演の更新に失敗しました', detail: lastError?.message })
  }

  const { data: fullEvent, error: fetchError } = await database
    .from('schedule_events')
    .select(SCHEDULE_EVENT_FULL_SELECT)
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .single()
  if (fetchError) {
    console.error('[schedule:update] fetch error:', fetchError)
    return res.status(500).json({ error: '更新後の取得に失敗しました', detail: fetchError.message })
  }
  return res.status(200).json(fullEvent)
}
