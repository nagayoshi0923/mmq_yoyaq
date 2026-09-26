import { apiClient } from './apiClient'
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
  const result: Record<string, GroupSurveySettings> = {}
  for (let offset = 0; offset < groupIds.length; offset += 50) {
    const ids = groupIds.slice(offset, offset + 50).join(',')
    Object.assign(result, await apiClient.get(`/api/schedule?type=group-survey-settings&group_ids=${encodeURIComponent(ids)}`))
  }
  return result
}
