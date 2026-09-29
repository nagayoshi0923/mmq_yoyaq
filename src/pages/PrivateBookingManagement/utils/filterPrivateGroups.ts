import type { PrivateGroupListItem } from '../hooks/usePrivateGroupList'
import { formatJstYmd } from '@/utils/jstDate'

export function filterPrivateGroups(groups: PrivateGroupListItem[], filters: {
  searchTerm: string; statusFilter: string; hideCompleted: boolean; showSurveyOnly: boolean
}, now = new Date()) {
  const search = filters.searchTerm.trim().toLowerCase()
  const today = formatJstYmd(now, '-')
  return groups.filter(group => {
    if (search && ![
      group.scenario_masters?.title, group.organizer?.name, group.organizer?.nickname,
      group.invite_code, ...(group.reservation_numbers || []),
    ].some(value => value?.toLowerCase().includes(search))) return false
    if (filters.statusFilter !== 'all' && group.status !== filters.statusFilter) return false
    if (filters.showSurveyOnly && !group.survey_enabled) return false
    // 検索時は過去履歴も見つけられるよう、完了非表示を一時的に適用しない。
    if (!search && filters.hideCompleted) {
      if (group.status === 'cancelled') return false
      if (group.status === 'confirmed' && group.confirmed_date && group.confirmed_date < today) return false
    }
    return true
  })
}
