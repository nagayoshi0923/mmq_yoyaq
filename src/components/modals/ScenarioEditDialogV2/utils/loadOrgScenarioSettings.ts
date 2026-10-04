/**
 * 作品編集画面を開いたとき、組織ごとの上書き・設定（organization_scenarios）を読み、入力欄に重ねる。
 * ビュー (organization_scenarios_with_master) の COALESCE と同じ優先順位で読み込む。
 * ScenarioEditDialogV2.tsx から中身を変えずに移したもの。後から別の読み込みが始まっていたら（isCurrent が偽）反映しない。
 */
import type { Dispatch, SetStateAction } from 'react'
import { getCurrentOrganizationId } from '@/lib/organization'
import { apiClient } from '@/lib/apiClient'
import { scenarioMasterApi } from '@/lib/api/scenarioMasterApi'
import { organizationScenarioReadApi } from '@/lib/api/scenarioReadApi'
import { scenarioEffectiveFields, type ScenarioSourceState } from '@/lib/scenarioSettingSources'
import { readSurveyQuestionSettings, type SurveyQuestionSnapshot } from '@/lib/surveyQuestionSettings'
import { parseScenarioSlotStartTimes } from '@/lib/privateBookingSlotStartTimes'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import type { Scenario } from '@/types'
import type { ScenarioFormData } from '../types'

export async function loadOrgScenarioSettings({ scenario, masterId, loadGeneration, isCurrent, setFormData, setSurveySnapshot, setSourceState }: {
  scenario: Scenario
  masterId: string
  loadGeneration: number
  isCurrent: (generation: number) => boolean
  setFormData: Dispatch<SetStateAction<ScenarioFormData>>
  setSurveySnapshot: (snapshot: SurveyQuestionSnapshot & { scenarioId: string }) => void
  setSourceState: (state: ScenarioSourceState) => void
}): Promise<void> {
  try {
    const loadOrgId = await getCurrentOrganizationId()
    if (loadOrgId) {
      const osData = await apiClient.get<Record<string, any> | null>(
        `/api/org-scenarios?${new URLSearchParams({ type: 'settings-source', masterId })}`
      )
      // A master may be unreadable (for example an older private master).
      // Preserve the loaded effective values and raw override state in that case.
      const sourceMaster = await scenarioMasterApi.getById(masterId).catch(() => null)
      const sourceBaseline = scenarioEffectiveFields(osData || {}, sourceMaster
        ? { ...sourceMaster }
        : { ...scenario, official_duration: scenario.duration })
      if (osData) {
        const loadedSurvey = await readSurveyQuestionSettings(osData.id)
        if (!isCurrent(loadGeneration)) return
        const surveyQuestions = loadedSurvey.questions
        setSurveySnapshot({ ...loadedSurvey, scenarioId: osData.id })

        setFormData(prev => ({
          ...prev,
          ...sourceBaseline,
          // 対応店舗: organization_scenarios側のデータを優先
          available_stores: (osData.available_stores && osData.available_stores.length > 0) 
            ? osData.available_stores 
            : prev.available_stores,
          // アンケート設定
          survey_url: osData.survey_url || null,
          survey_enabled: osData.survey_enabled || false,
          survey_deadline_days: osData.survey_deadline_days ?? 1,
          survey_questions: surveyQuestions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options || [],
            is_required: q.is_required,
            order_num: q.order_num,
          })),
          // キャラクター情報
          characters: osData.characters || [],
          // 貸切受付不可時間帯
          private_booking_blocked_slots: osData.private_booking_blocked_slots || [],
          private_booking_slot_start_times: parseScenarioSlotStartTimes((osData as { private_booking_slot_start_times?: unknown }).private_booking_slot_start_times),
          // 貸切募集期間
          booking_start_date: osData.booking_start_date || null,
          booking_end_date: osData.booking_end_date || null,
          // シナリオ種別・貸切受付フラグ・公演期間
          scenario_kind: osData.scenario_kind || 'regular',
          accepts_private_booking: osData.accepts_private_booking ?? true,
          available_from: osData.available_from || null,
          available_until: osData.available_until || null,
          is_license_buyout: (osData as { is_license_buyout?: boolean | null }).is_license_buyout === true,
        }))

        setSourceState({ stored: osData, baseline: sourceBaseline })
        // 定型文を別クエリで安全に取得（カラム未追加の環境でもエラーにならない）
        try {
          const { data: tplData } = await organizationScenarioReadApi.getEmailTemplates(osData.id)
          const notice = (tplData as { individual_notice_template?: string | null } | null)?.individual_notice_template
          const confirmTpl = (tplData as { reservation_confirmation_template?: string | null } | null)?.reservation_confirmation_template
          const privateTpl = (tplData as { private_confirm_template?: string | null } | null)?.private_confirm_template
          if (notice || confirmTpl || privateTpl) {
            setFormData(prev => ({
              ...prev,
              ...(notice ? { individual_notice_template: notice } : {}),
              ...(confirmTpl ? { reservation_confirmation_template: confirmTpl } : {}),
              ...(privateTpl ? { private_confirm_template: privateTpl } : {}),
            }))
          }
        } catch {
          // カラムが存在しない場合は無視
        }
      } else {
        if (!isCurrent(loadGeneration)) return
        setFormData(prev => ({ ...prev, ...sourceBaseline }))
        setSourceState({ stored: {}, baseline: sourceBaseline })

      }
    }
  } catch (e) {
    logger.error('override値取得エラー:', e)
    if (isCurrent(loadGeneration)) showToast.error('設定を読み込めませんでした', '保存せず、画面を開き直してください。')
  }
}
