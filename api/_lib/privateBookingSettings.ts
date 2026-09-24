import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireAdmin, requireStaff, type AuthUser } from './auth.js'

export async function privateBookingSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  requireStaff(user)
  if (!user.orgId) return res.status(403).json({ error: '組織情報が必要です' })
  const masterId = req.query.id
  if (masterId !== undefined && (typeof masterId !== 'string' || !/^[0-9a-f-]{36}$/i.test(masterId))) return res.status(400).json({ error: 'シナリオIDが不正です' })
  res.setHeader('Cache-Control', 'no-store')
  if (save) {
    requireAdmin(user)
    const { days, expected_updated_at: revision } = req.body ?? {}
    if ((days === null ? !masterId : !Number.isInteger(days) || days < 0 || days > 90)
      || (revision !== null && (typeof revision !== 'string' || !Number.isFinite(Date.parse(revision))))) {
      return res.status(400).json({ error: '締切は0〜90日の整数を指定してください' })
    }
    const updated_at = new Date().toISOString()
    if (masterId) {
      if (!revision) return res.status(409).json({ error: '再読込してください' })
      const { data, error } = await db!.from('organization_scenarios')
        .update({ private_booking_deadline_days: days, updated_at }).eq('organization_id', user.orgId)
        .eq('scenario_master_id', masterId).eq('updated_at', revision).select('id').maybeSingle()
      if (error) return res.status(500).json({ error: '締切を保存できませんでした' })
      if (!data) return res.status(409).json({ error: 'シナリオが変更されています。再読込してください' })
    } else if (revision) {
      const { data, error } = await db!.from('global_settings').update({ private_booking_deadline_days: days, updated_at })
        .eq('organization_id', user.orgId).eq('updated_at', revision).select('id').maybeSingle()
      if (error) return res.status(500).json({ error: '共通設定を保存できませんでした' })
      if (!data) return res.status(409).json({ error: '共通設定が変更されています。再読込してください' })
    } else {
      const { error } = await db!.from('global_settings').insert({ organization_id: user.orgId, private_booking_deadline_days: days, updated_at })
      if (error) return res.status(error.code === '23505' ? 409 : 500).json({ error: '保存できませんでした。再読込してください' })
    }
    return res.status(200).json({ success: true })
  }
  const { data: common, error } = await db!.from('global_settings').select('private_booking_deadline_days,updated_at').eq('organization_id', user.orgId).maybeSingle()
  if (error) return res.status(500).json({ error: '共通設定を読み込めませんでした' })
  let setting = common
  if (masterId) {
    const result = await db!.from('organization_scenarios').select('private_booking_deadline_days,updated_at')
      .eq('organization_id', user.orgId).eq('scenario_master_id', masterId).maybeSingle()
    if (result.error) return res.status(500).json({ error: 'シナリオ設定を読み込めませんでした' })
    setting = result.data
  }
  return res.status(200).json({ setting, common_days: common?.private_booking_deadline_days ?? 14, can_edit: ['admin', 'license_admin'].includes(user.role) })
}
