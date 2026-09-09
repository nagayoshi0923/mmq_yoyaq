import type { VercelRequest, VercelResponse } from '@vercel/node'
import { db } from './db.js'
import { ApiError, type AuthUser } from './auth.js'

const TEMPLATE_FIELDS = 'reservation_confirmation_template, private_confirm_template'

export async function confirmationTemplates(req: VercelRequest, res: VercelResponse, user: AuthUser, write = false) {
  if (!db) throw new ApiError(500, 'db unavailable')
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) throw new ApiError(400, '公演IDが必要です')
  const { data: event, error } = await db.from('schedule_events')
    .select(`id, store_id, organization_scenario_id, ${TEMPLATE_FIELDS}`)
    .eq('id', id).eq('organization_id', user.orgId).maybeSingle()
  if (error) throw new ApiError(500, '公演情報を取得できません')
  if (!event) throw new ApiError(404, '公演が見つかりません')

  if (write) {
    const { templateKey, value } = req.body ?? {}
    if (!['reservation_confirmation_template', 'private_confirm_template'].includes(templateKey)
      || (value !== null && typeof value !== 'string')) throw new ApiError(400, 'テンプレートの指定が不正です')
    const { data: updated, error: updateError } = await db.from('schedule_events')
      .update({ [templateKey]: value?.trim() || null })
      .eq('id', id).eq('organization_id', user.orgId).select('id').maybeSingle()
    if (updateError) throw new ApiError(500, 'テンプレートを保存できません')
    if (!updated) throw new ApiError(404, '公演が見つかりません')
    return res.status(200).json({ success: true })
  }

  let scenario = null
  if (event.organization_scenario_id) {
    const result = await db.from('organization_scenarios').select(TEMPLATE_FIELDS)
      .eq('id', event.organization_scenario_id).eq('organization_id', user.orgId).maybeSingle()
    if (result.error) throw new ApiError(500, '作品テンプレートを取得できません')
    scenario = result.data
  }
  let storeQuery = db.from('email_settings')
    .select(`company_name, company_phone, company_email, ${TEMPLATE_FIELDS}`)
    .eq('organization_id', user.orgId)
  if (event.store_id) storeQuery = storeQuery.eq('store_id', event.store_id)
  const { data: store, error: storeError } = await storeQuery.order('id').limit(1).maybeSingle()
  if (storeError) throw new ApiError(500, '店舗テンプレートを取得できません')
  return res.status(200).json({ event, scenario, store })
}
