import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireAdmin, requireStaff, type AuthUser } from './auth.js'

export async function bookingCutoffSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  requireStaff(user)
  if (!user.orgId) return res.status(403).json({ error: '組織情報が必要です' })
  const masterId = req.query.id
  if (masterId !== undefined && (typeof masterId !== 'string' || !/^[0-9a-f-]{36}$/i.test(masterId))) return res.status(400).json({ error: 'シナリオIDが不正です' })
  res.setHeader('Cache-Control', 'no-store')
  if (save) {
    requireAdmin(user)
    const { minutes, expected_updated_at: revision } = req.body ?? {}
    if ((minutes === null ? !masterId : !Number.isInteger(minutes) || minutes < 0 || minutes > 1440)
      || (revision !== null && (typeof revision !== 'string' || !Number.isFinite(Date.parse(revision))))) {
      return res.status(400).json({ error: '締切は0〜1440分の整数を指定してください' })
    }
    const updated_at = new Date().toISOString()
    if (masterId) {
      if (!revision) return res.status(409).json({ error: '再読込してください' })
      const expected = req.body?.expected_minutes
      if (expected !== null && (!Number.isInteger(expected) || expected < 0 || expected > 1440)) return res.status(400).json({ error: '読み込んだ締切を確認できません。再読込してください' })
      let query = db!.from('organization_scenarios')
        .update({ booking_cutoff_minutes: minutes, updated_at }).eq('organization_id', user.orgId)
        .eq('scenario_master_id', masterId)
      query = expected === null ? query.is('booking_cutoff_minutes', null) : query.eq('booking_cutoff_minutes', expected)
      const { data, error } = await query.select('id').maybeSingle()
      if (error) return res.status(500).json({ error: '締切を保存できませんでした' })
      if (!data) return res.status(409).json({ error: 'シナリオが変更されています。再読込してください' })
    } else if (revision) {
      const { data, error } = await db!.from('global_settings').update({ booking_cutoff_minutes: minutes, updated_at })
        .eq('organization_id', user.orgId).eq('updated_at', revision).select('id').maybeSingle()
      if (error) return res.status(500).json({ error: '共通設定を保存できませんでした' })
      if (!data) return res.status(409).json({ error: '共通設定が変更されています。再読込してください' })
    } else {
      const { error } = await db!.from('global_settings').insert({ organization_id: user.orgId, booking_cutoff_minutes: minutes, updated_at })
      if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: '保存できませんでした。再読込してください' })
    }
    return res.status(200).json({ success: true })
  }
  const { data: common, error } = await db!.from('global_settings').select('booking_cutoff_minutes,updated_at').eq('organization_id', user.orgId).maybeSingle()
  if (error) return res.status(500).json({ error: '共通設定を読み込めませんでした' })
  let setting = common
  if (masterId) {
    const result = await db!.from('organization_scenarios').select('booking_cutoff_minutes,updated_at')
      .eq('organization_id', user.orgId).eq('scenario_master_id', masterId).maybeSingle()
    if (result.error) return res.status(500).json({ error: 'シナリオ設定を読み込めませんでした' })
    setting = result.data
  }
  return res.status(200).json({ setting, common_minutes: common?.booking_cutoff_minutes ?? 0, can_edit: ['admin', 'license_admin'].includes(user.role) })
}
