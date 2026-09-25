import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { ApiError, requireStaff, requireAdmin, type AuthUser } from './auth.js'
import { loadSettingLayers } from '../../supabase/functions/_shared/load-setting-layers.js'
import { resolveSetting } from '../../supabase/functions/_shared/settings-inheritance.js'
import { isValidSettingValue } from '../../supabase/functions/_shared/setting-definitions.js'

/** 旧クライアント向け互換口。保存先と継承規則は新設定と同じ。 */
export async function confirmationTemplates(req: VercelRequest, res: VercelResponse, user: AuthUser, write = false) {
  requireStaff(user)
  if (!db || !user.orgId) throw new ApiError(403, '組織情報が必要です')
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) throw new ApiError(400, '公演IDが必要です')
  if (write) requireAdmin(user)
  let data: Awaited<ReturnType<typeof loadSettingLayers>>
  try { data = await loadSettingLayers(db, { organizationId: user.orgId, performanceId: id }) }
  catch (error) {
    if (error instanceof Error && error.message === '公演が見つかりません') throw new ApiError(404, error.message)
    throw error
  }
  res.setHeader('Cache-Control','no-store')
  if (write) {
    const { templateKey, value } = req.body ?? {}
    if (!['reservation_confirmation_template','private_confirm_template'].includes(templateKey) || !isValidSettingValue(templateKey,value,'performance')) throw new ApiError(400,'テンプレートの指定が不正です')
    const result = await db.rpc('save_operating_setting_overrides', { p_organization_id:user.orgId,p_scope:'performance',p_target_id:id,p_values:{[templateKey]:typeof value === 'string' ? value.trim() || null : null},p_expected_revision:data.revisions.performance })
    if (result.error?.code === '40001') throw new ApiError(409,'設定が変更されています。再読み込みしてください')
    if (result.error) throw new ApiError(500,'テンプレートを保存できません')
    return res.status(200).json({success:true})
  }
  const lower = {organization:data.layers.organization,store:data.layers.store}
  const store = Object.fromEntries(['company_name','company_phone','company_email','reservation_confirmation_template','private_confirm_template'].map(key=>[key,resolveSetting(key,'',lower).value]))
  return res.status(200).json({event:data.layers.performance,scenario:data.layers.scenario,store})
}
