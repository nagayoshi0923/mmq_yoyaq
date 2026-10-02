// api/schedule.ts の募集期限・予約受付の設定（整備 Phase 3、#774。元の行をそのまま移した。ロジックの変更なし）
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from '../db.js'
import { requireAdmin, type AuthUser } from '../auth.js'

// 公演ごとの募集期限。組織はリクエスト値ではなく認証済みプロフィールから取得する。
export async function handleExtendRecruitment(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)
  return res.status(409).json({ error: '追加募集はシナリオのゲーム設定で変更してください。公演ごとの期限変更はできません。' })
}

export async function handleBookingWindow(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  const id = req.query.id
  if (typeof id !== 'string') return res.status(400).json({ error: '公演IDが必要です' })
  const { data: event, error: eventError } = await db!.from('schedule_events').select('id')
    .eq('id', id).eq('organization_id', user.orgId).maybeSingle()
  if (eventError) return res.status(500).json({ error: '公演を確認できませんでした' })
  if (!event) return res.status(404).json({ error: '公演が見つかりません' })
  const { data, error } = await db!.rpc('get_performance_booking_window', { p_event_id: id })
  if (error) return res.status(500).json({ error: '締切を取得できませんでした' })
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ window: data?.[0] ?? null, can_edit: ['admin','license_admin'].includes(user.role) })
}

export async function handleBookingCutoff(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireAdmin(user)
  const id = req.query.id
  const { minutes, expected_updated_at: expectedUpdatedAt } = req.body ?? {}
  if (typeof id !== 'string' || (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440))
    || typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return res.status(400).json({ error: '締切は0〜1440分、または標準設定を指定してください' })
  }
  const { data, error } = await db!.from('schedule_events')
    .update({ booking_cutoff_minutes: minutes, updated_at: new Date().toISOString() })
    .eq('id', id).eq('organization_id', user.orgId).eq('category', 'open').eq('is_cancelled', false)
    .eq('updated_at', expectedUpdatedAt).select('id').maybeSingle()
  if (error) return res.status(500).json({ error: '予約締切を保存できませんでした' })
  if (!data) return res.status(409).json({ error: '公演が変更されています。再読込してください' })
  return res.status(200).json({ success: true })
}

export async function handleScenarioBookingCutoff(req: VercelRequest, res: VercelResponse, user: AuthUser, save: boolean) {
  const id = req.query.id
  if (typeof id !== 'string') return res.status(400).json({ error: 'シナリオIDが必要です' })
  if (save) {
    requireAdmin(user)
    const { minutes, expected_updated_at: revision } = req.body ?? {}
    if ((minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440))
      || typeof revision !== 'string' || !Number.isFinite(Date.parse(revision))) {
      return res.status(400).json({ error: '締切は0〜1440分の整数を指定してください' })
    }
    const { data, error } = await db!.from('organization_scenarios')
      .update({ booking_cutoff_minutes: minutes, updated_at: new Date().toISOString() })
      .eq('scenario_master_id', id).eq('organization_id', user.orgId).eq('updated_at', revision).select('id').maybeSingle()
    if (error) return res.status(500).json({ error: 'シナリオの予約締切を保存できませんでした' })
    if (!data) return res.status(409).json({ error: 'シナリオが変更されています。再読込してください' })
    return res.status(200).json({ success: true })
  }
  const { data, error } = await db!.from('organization_scenarios')
    .select('booking_cutoff_minutes,updated_at').eq('scenario_master_id', id).eq('organization_id', user.orgId).maybeSingle()
  if (error) return res.status(500).json({ error: 'シナリオの予約締切を読み込めませんでした' })
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ setting: data, can_edit: ['admin','license_admin'].includes(user.role) })
}
