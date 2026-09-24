import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { requireAdmin, requireStaff, type AuthUser } from './auth.js'

import { DEFAULT_RECRUITMENT_TARGET, isRecruitmentTarget, recruitmentMissingLimit } from '../../shared/recruitmentTarget.js'

export async function recruitmentSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  requireStaff(user)
  if (!user.orgId) return res.status(403).json({ error: '組織情報が必要です' })
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
    const source = req.body?.source ?? 'custom'
    const enabledSource = req.body?.enabled_source ?? 'custom'
    const deadlineSource = req.body?.deadline_source ?? 'custom'
    const mode = req.body?.mode ?? 'count'
    const value = req.body?.value ?? max_missing
    if (!['common', 'custom'].includes(enabledSource) || !['common', 'custom'].includes(deadlineSource) || typeof enabled !== 'boolean' || !['common', 'custom'].includes(source) || !isRecruitmentTarget(mode, value)
      || !Number.isInteger(deadline_minutes) || deadline_minutes < 1 || deadline_minutes > 239
      || typeof expected_updated_at !== 'string' || !Number.isFinite(Date.parse(expected_updated_at))) {
      return res.status(400).json({ error: '対象は1〜20人または1〜100％、期限は開始1〜239分前で指定してください' })
    }
    const { data, error } = await db!.rpc('save_scenario_recruitment_settings_v3', {
      p_organization_id: user.orgId, p_master_id: masterId, p_actor_id: user.userId,
      p_enabled: enabled, p_enabled_source: enabledSource, p_deadline_source: deadlineSource, p_source: source, p_mode: mode, p_value: value, p_deadline_minutes: deadline_minutes, p_expected_updated_at: expected_updated_at,
    })
    if (error) return res.status(500).json({ error: '追加募集設定を保存できませんでした' })
    if (!data?.success) return res.status(data?.error === 'NOT_FOUND' ? 404 : 409).json({ error: '設定が変更されています。再読込してください' })
    return res.status(200).json(data)
  }
  const { data: setting, error } = await db!.from('organization_scenarios')
    .select('id,recruitment_enabled_source,recruitment_deadline_source,recruitment_extension_enabled,recruitment_max_missing,recruitment_deadline_minutes,recruitment_target_source,recruitment_target_mode,recruitment_target_value,override_player_count_min,override_player_count_max,updated_at')
    .eq('organization_id', user.orgId).eq('scenario_master_id', masterId).maybeSingle()
  if (error) return res.status(500).json({ error: '追加募集設定を読み込めませんでした' })
  const [{ data: common, error: commonError }, { data: master, error: masterError }] = await Promise.all([
    db!.from('organization_recruitment_settings').select('mode,value,enabled,deadline_minutes,updated_at').eq('organization_id', user.orgId).maybeSingle(),
    db!.from('scenario_masters').select('player_count_min,player_count_max').eq('id', masterId).maybeSingle(),
  ])
  if (commonError || masterError) return res.status(500).json({ error: '開催人数・共通設定を読み込めませんでした' })
  const max = setting?.override_player_count_max ?? master?.player_count_max ?? 8
  const minimum = Math.max(1, Math.min(max, setting?.override_player_count_min ?? master?.player_count_min ?? Math.ceil(max / 2)))
  const commonTarget = common ?? { ...DEFAULT_RECRUITMENT_TARGET, enabled: true, deadline_minutes: 90, updated_at: null }
  const target = setting?.recruitment_target_source === 'custom' ? { mode: setting.recruitment_target_mode, value: setting.recruitment_target_value } : commonTarget
  const { data: history, error: historyError } = setting ? await db!.from('scenario_recruitment_setting_history')
    .select('id,actor_id,before_settings,after_settings,created_at').eq('organization_id', user.orgId)
    .eq('organization_scenario_id', setting.id).order('created_at', { ascending: false }).limit(30) : { data: [], error: null }
  if (historyError) return res.status(500).json({ error: '変更履歴を読み込めませんでした' })
  const actorIds = [...new Set((history ?? []).map(h => h.actor_id))]
  const { data: actors } = actorIds.length ? await db!.from('staff').select('user_id,name').eq('organization_id', user.orgId).in('user_id', actorIds) : { data: [] }
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ setting, common: commonTarget, min_required: minimum, effective_max_missing: recruitmentMissingLimit(minimum, target), effective_enabled: setting?.recruitment_enabled_source === 'custom' ? setting.recruitment_extension_enabled : commonTarget.enabled, effective_deadline_minutes: setting?.recruitment_deadline_source === 'custom' ? setting.recruitment_deadline_minutes : commonTarget.deadline_minutes, history: (history ?? []).map(h => ({ ...h, actor_name: actors?.find(a => a.user_id === h.actor_id)?.name ?? h.actor_id })), can_edit: ['admin', 'license_admin'].includes(user.role) })
}

export async function commonRecruitmentSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  requireStaff(user)
  if (!user.orgId) return res.status(403).json({ error: '組織情報が必要です' })
  res.setHeader('Cache-Control', 'no-store')
  if (save) {
    requireAdmin(user)
    const { mode, value, expected_updated_at, enabled, deadline_minutes } = req.body ?? {}
    const hasOperatingSettings = enabled !== undefined || deadline_minutes !== undefined
    if ((hasOperatingSettings && (typeof enabled !== 'boolean' || !Number.isInteger(deadline_minutes) || deadline_minutes < 1 || deadline_minutes > 239)) || !isRecruitmentTarget(mode, value) || (expected_updated_at !== null && (typeof expected_updated_at !== 'string' || !Number.isFinite(Date.parse(expected_updated_at))))) {
      return res.status(400).json({ error: '対象を1〜20人または1〜100％で指定してください' })
    }
    const { data, error } = await db!.rpc(hasOperatingSettings ? 'save_organization_recruitment_settings_v2' : 'save_organization_recruitment_settings', {
      ...(hasOperatingSettings ? { p_enabled: enabled, p_deadline_minutes: deadline_minutes } : {}),
      p_organization_id: user.orgId, p_actor_id: user.userId, p_mode: mode, p_value: value, p_expected_updated_at: expected_updated_at,
    })
    if (error) return res.status(500).json({ error: '共通設定を保存できませんでした' })
    if (!data?.success) return res.status(data?.error === 'NOT_FOUND' ? 404 : 409).json({ error: '設定が変更されています。再読込してください' })
    return res.status(200).json(data)
  }
  const [{ data: setting, error }, { count: commonCount, error: countError }, { count: customCount, error: customError }] = await Promise.all([
    db!.from('organization_recruitment_settings').select('mode,value,enabled,deadline_minutes,updated_at').eq('organization_id', user.orgId).maybeSingle(),
    db!.from('organization_scenarios').select('id', { count: 'exact', head: true }).eq('organization_id', user.orgId).eq('recruitment_target_source', 'common'),
    db!.from('organization_scenarios').select('id', { count: 'exact', head: true }).eq('organization_id', user.orgId).eq('recruitment_target_source', 'custom'),
  ])
  if (error || countError || customError) return res.status(500).json({ error: '共通設定を読み込めませんでした' })
  return res.status(200).json({ setting: setting ?? { ...DEFAULT_RECRUITMENT_TARGET, enabled: true, deadline_minutes: 90, updated_at: null }, common_count: commonCount, custom_count: customCount, can_edit: ['admin', 'license_admin'].includes(user.role) })
}
