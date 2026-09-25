import { loadEffectiveEmailSettings } from '../../supabase/functions/_shared/effective-email-settings.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { ApiError, requireAdmin, requireStaff, type AuthUser } from './auth.js'
import { loadSettingLayers, type SettingContext } from '../../supabase/functions/_shared/load-setting-layers.js'
import { isValidSettingValue } from '../../supabase/functions/_shared/setting-definitions.js'
import { SETTING_SCOPES, type SettingScope } from '../../supabase/functions/_shared/settings-inheritance.js'

export async function operatingSettings(req: VercelRequest, res: VercelResponse, user: AuthUser, save = false) {
  requireStaff(user)
  if (!db || !user.orgId) throw new ApiError(403, '組織情報が必要です')
  res.setHeader('Cache-Control', 'no-store')
  const scope = req.query.scope
  if (typeof scope !== 'string' || !SETTING_SCOPES.includes(scope as SettingScope)) throw new ApiError(400, '設定の対象が不正です')
  const target = scope === 'organization' ? user.orgId : req.query.target_id
  if (typeof target !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
    throw new ApiError(400, '対象IDが不正です')
  }
  const context: SettingContext = {
    organizationId: user.orgId,
    ...(scope === 'store' ? { storeId: target } : {}),
    ...(scope === 'scenario' ? { scenarioId: target } : {}),
    ...(scope === 'performance' ? { performanceId: target } : {}),
  }
  if (save) {
    requireAdmin(user)
    const { settings, expected_revision: revision } = req.body ?? {}
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || !Number.isSafeInteger(revision) || revision < 0
      || Object.keys(settings).length === 0
      || !Object.entries(settings).every(([key, value]) => isValidSettingValue(key, value, scope as SettingScope))) {
      throw new ApiError(400, '設定値が不正です。対象項目と値を確認してください')
    }
    const result = await db.rpc('save_operating_setting_overrides', {
      p_organization_id: user.orgId, p_scope: scope, p_target_id: target,
      p_values: settings, p_expected_revision: revision,
    })
    if (result.error) {
      if (['40001', '23505'].includes(result.error.code)) throw new ApiError(409, '設定が変更されています。再読み込みしてください')
      if (result.error.code === '42501') throw new ApiError(404, '設定の対象が見つかりません')
      throw new ApiError(500, '設定を保存できませんでした')
    }
    return res.status(200).json({ success: true, revision: result.data })
  }
  const result = await loadSettingLayers(db, context)
  return res.status(200).json({ ...result, can_edit: ['admin', 'license_admin'].includes(user.role) })
}

export async function groupSurveySettings(req: VercelRequest, res: VercelResponse, user: AuthUser, freeze = false) {
  requireStaff(user)
  if (!db || !user.orgId) throw new ApiError(403, '組織情報が必要です')
  const groupId = req.query.group_id
  const groupIds = typeof req.query.group_ids === 'string' ? req.query.group_ids.split(',') : null
  const validId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  if (groupIds ? groupIds.length > 100 || !groupIds.every(validId) : !validId(groupId)) throw new ApiError(400, 'グループIDが不正です')
  res.setHeader('Cache-Control', 'no-store')
  if (freeze && groupIds) throw new ApiError(400, '期限の固定はグループ単位で実行してください')
  const result = groupIds
    ? await db.rpc('get_private_groups_survey_settings', { p_organization_id: user.orgId, p_group_ids: groupIds })
    : await db.rpc(freeze ? 'freeze_private_group_survey_deadline' : 'get_private_group_survey_settings', { p_organization_id: user.orgId, p_group_id: groupId })
  if (result.error?.code === '42501') throw new ApiError(404, 'グループが見つかりません')
  if (result.error) throw new ApiError(500, 'アンケート設定を取得できませんでした')
  return res.status(200).json(result.data)
}

export async function effectiveEmailSettings(req: VercelRequest, res: VercelResponse, user: AuthUser) {
  requireStaff(user)
  if (!db || !user.orgId) throw new ApiError(403, '組織情報が必要です')
  const reservationId = req.query.reservation_id
  if (typeof reservationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reservationId)) throw new ApiError(400, '予約IDが不正です')
  const settings = await loadEffectiveEmailSettings(db, { organizationId: user.orgId, reservationId })
  res.setHeader('Cache-Control','no-store')
  return res.status(200).json(settings)
}
