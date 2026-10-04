/**
 * 作品編集画面の保存で、組織ごとの作品設定（organization_scenarios）を登録または更新し、メールの上書き文面を保存する。
 * ScenarioEditDialogV2.tsx から中身を変えずに移したもの。登録・更新した行の id を返す。
 */
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { organizationScenarioWriteApi } from '@/lib/api/scenarioWriteApi'
import type { ScenarioFormData } from '../types'
import type { buildOrgScenarioPayload } from './savePayload'

export async function upsertOrganizationScenario({ organizationId, existingId, payload, formData }: {
  organizationId: string
  existingId: string | null
  payload: ReturnType<typeof buildOrgScenarioPayload>
  formData: ScenarioFormData
}): Promise<string | null> {
  let orgScenarioId: string | null = existingId || null

  if (!existingId) {
    // organization_scenariosに登録
    const { data: insertedData, error: orgScenarioError } = await organizationScenarioWriteApi.insertReturningId(payload)
    
    if (orgScenarioError) {
      logger.error('organization_scenarios登録エラー:', orgScenarioError)
      throw orgScenarioError
    } else {
      logger.log('organization_scenariosに登録しました')
      orgScenarioId = insertedData?.id || null
    }
  } else {
    // 既存レコードがある場合は更新（organization_id, scenario_master_id は除く）
    const { organization_id: _oid, scenario_master_id: _mid, ...updatePayload } = payload
    const { error: updateError } = await organizationScenarioWriteApi.updateByIdInOrganization(existingId, organizationId, {
        ...updatePayload,
        updated_at: new Date().toISOString()
      })
    
    if (updateError) {
      logger.error('organization_scenarios更新エラー:', updateError)
      logger.error('🚨 organization_scenarios UPDATE失敗:', updateError.message, updateError.code)
      throw updateError
    } else {
      logger.log('organization_scenariosを更新しました（override含む）')
      logger.log('✅ organization_scenarios保存成功 available_stores:', updatePayload.available_stores)
    }
  }

  // 定型文を別途安全に保存（カラム未追加の環境でもエラーにならない）
  if (orgScenarioId && (
    formData.individual_notice_template !== undefined
    || formData.reservation_confirmation_template !== undefined
    || formData.private_confirm_template !== undefined
  )) {
    try {
      const { error: tplError } = await organizationScenarioWriteApi.updateByIdInOrganization(orgScenarioId, organizationId, {
          individual_notice_template: formData.individual_notice_template || null,
          reservation_confirmation_template: formData.reservation_confirmation_template?.trim() || null,
          private_confirm_template: formData.private_confirm_template?.trim() || null,
        })
      if (tplError) {
        logger.error('メール上書きの保存エラー:', tplError)
        showToast.error('メール上書きの保存に失敗しました')
      }
    } catch {
      // カラムが存在しない場合は無視
    }
  }

  return orgScenarioId
}
