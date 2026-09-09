import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireAdmin, type AuthUser } from './auth.js'

export async function recruitmentSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  let masterId = req.query.id
  if (typeof masterId !== 'string') return res.status(400).json({ error: 'シナリオIDが必要です' })
  if (req.query.event_id) {
    const { data: event, error } = await db!.from('schedule_events').select('scenario_master_id,scenario_id,organization_scenario_id')
      .eq('organization_id', user.orgId).eq('id', req.query.event_id).maybeSingle()
    if (error || !event) return res.status(404).json({ error: '公演が見つかりません' })
    if (event.organization_scenario_id) {
      const { data } = await db!.from('organization_scenarios').select('scenario_master_id').eq('organization_id', user.orgId).eq('id', event.organization_scenario_id).maybeSingle()
      masterId = data?.scenario_master_id
    } else masterId = event.scenario_master_id ?? event.scenario_id
  }
  if (save) {
    requireAdmin(user)
    const { enabled, max_missing, deadline_minutes, expected_updated_at } = req.body ?? {}
    if (typeof enabled !== 'boolean' || !Number.isInteger(max_missing) || max_missing < 1 || max_missing > 20
      || !Number.isInteger(deadline_minutes) || deadline_minutes < 1 || deadline_minutes > 239
      || typeof expected_updated_at !== 'string' || !Number.isFinite(Date.parse(expected_updated_at))) {
      return res.status(400).json({ error: '不足人数は1〜20人、期限は開始1〜239分前で指定してください' })
    }
    const { data, error } = await db!.rpc('save_scenario_recruitment_settings', {
      p_organization_id: user.orgId, p_master_id: masterId, p_actor_id: user.userId,
      p_enabled: enabled, p_max_missing: max_missing, p_deadline_minutes: deadline_minutes, p_expected_updated_at: expected_updated_at,
    })
    if (error) return res.status(500).json({ error: '追加募集設定を保存できませんでした' })
    if (!data?.success) return res.status(data?.error === 'NOT_FOUND' ? 404 : 409).json({ error: '設定が変更されています。再読込してください' })
    return res.status(200).json(data)
  }
  const { data: setting, error } = await db!.from('organization_scenarios')
    .select('id,recruitment_extension_enabled,recruitment_max_missing,recruitment_deadline_minutes,updated_at')
    .eq('organization_id', user.orgId).eq('scenario_master_id', masterId).maybeSingle()
  if (error) return res.status(500).json({ error: '追加募集設定を読み込めませんでした' })
  const { data: history, error: historyError } = setting ? await db!.from('scenario_recruitment_setting_history')
    .select('id,actor_id,before_settings,after_settings,created_at').eq('organization_id', user.orgId)
    .eq('organization_scenario_id', setting.id).order('created_at', { ascending: false }).limit(30) : { data: [], error: null }
  if (historyError) return res.status(500).json({ error: '変更履歴を読み込めませんでした' })
  const actorIds = [...new Set((history ?? []).map(h => h.actor_id))]
  const { data: actors } = actorIds.length ? await db!.from('staff').select('user_id,name').eq('organization_id', user.orgId).in('user_id', actorIds) : { data: [] }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ setting, history: (history ?? []).map(h => ({ ...h, actor_name: actors?.find(a => a.user_id === h.actor_id)?.name ?? h.actor_id })), can_edit: ['admin', 'license_admin'].includes(user.role) })
}
