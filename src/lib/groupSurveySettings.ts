import { apiClient } from './apiClient'
import { boundedBatches } from './boundedBatches'
export interface GroupSurveySettings {
  org_scenario_id: string
  survey_enabled: boolean
  survey_deadline_days: number
  survey_deadline_at: string | null
  survey_url: string
  characters: Array<{ id: string; name: string; is_npc?: boolean }>
}
export function getGroupSurveySettings(groupId: string, freeze = false): Promise<GroupSurveySettings> {
  return freeze
    ? apiClient.patch(`/api/schedule?action=freeze-group-survey-deadline&group_id=${encodeURIComponent(groupId)}`, {})
    : apiClient.get(`/api/schedule?type=group-survey-settings&group_id=${encodeURIComponent(groupId)}`)
}

export async function getGroupsSurveySettings(groupIds: string[]): Promise<Record<string, GroupSurveySettings>> {
  const pages = await boundedBatches([...new Set(groupIds)], 50, 3, async batch => {
    const data = await apiClient.get<Record<string, GroupSurveySettings>>(`/api/schedule?type=group-survey-settings&group_ids=${encodeURIComponent(batch.join(','))}`)
    if (!data || batch.some(id => !data[id])) throw new Error('一部のグループのアンケート設定を取得できませんでした')
    return [data]
  })
  return Object.assign({}, ...pages)
}
