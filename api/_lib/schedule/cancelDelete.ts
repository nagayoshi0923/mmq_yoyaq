// api/schedule.ts の公演の中止切替と削除（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { type AuthUser } from '../auth.js'

// ─── handleToggleCancel (PATCH action=toggle-cancel) ─────────────────────
export async function handleToggleCancel(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const database = db!
  const body = (req.body ?? {}) as Record<string, unknown>
  const isCancelled = body.is_cancelled === true
  const cancellationReason = typeof body.cancellation_reason === 'string' ? body.cancellation_reason : null

  // 自組織のイベントか確認
  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は変更できません' })
  }

  const updateData: Record<string, unknown> = {
    is_cancelled: isCancelled,
    cancellation_reason: isCancelled ? cancellationReason : null,
    cancelled_at: isCancelled ? new Date().toISOString() : null,
  }

  const { error } = await database
    .from('schedule_events')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', user.orgId)
  if (error) {
    console.error('[schedule:toggle-cancel] update error:', error)
    return res.status(500).json({ error: '公演の中止状態切り替えに失敗しました', detail: error.message })
  }

  const { data, error: fetchError } = await database
    .from('schedule_events')
    .select()
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .single()
  if (fetchError) {
    return res.status(500).json({ error: '取得に失敗しました', detail: fetchError.message })
  }
  return res.status(200).json(data)
}

// ─── handleDelete (DELETE) ───────────────────────────────────────────────
export async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id as string | undefined
  if (!id) return res.status(400).json({ error: 'id クエリパラメータが必要です' })

  const database = db!

  const { data: existing, error: existingErr } = await database
    .from('schedule_events')
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()
  if (existingErr) return res.status(500).json({ error: '公演情報の確認に失敗しました' })
  if (!existing) return res.status(404).json({ error: '公演が見つかりません' })
  if (existing.organization_id !== user.orgId) {
    return res.status(403).json({ error: '他組織の公演は削除できません' })
  }

  const { data: deletedRows, error } = await database
    .from('schedule_events')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.orgId)
    .select('id')
  if (error) {
    console.error('[schedule:delete] DB error:', error)
    return res.status(500).json({ error: '公演の削除に失敗しました', detail: error.message })
  }
  if (!deletedRows || deletedRows.length === 0) {
    console.error('[schedule:delete] deleted 0 rows:', { id, orgId: user.orgId })
    return res.status(409).json({
      error: '公演の削除に失敗しました',
      detail: '削除対象の公演が見つからない、または削除権限がありません',
    })
  }
  return res.status(204).end()
}
