import { useQuery } from '@tanstack/react-query'
import { privateGroupMemberAction } from '@/lib/privateGroupGuestSession'
import { logger } from '@/utils/logger'
import type { PrivateGroupSummary } from '../components/PrivateBookingCards/privateGroupSummary'

interface SurveyReadResult {
  survey_enabled?: boolean
  survey_url?: string | null
  survey_deadline_at?: string | null
  questions?: unknown[]
  existing_response_id?: string | null
}

/** 公演前アンケートが「自分に未回答で、まだ回答できる」か（グループ画面のアンケートと同じ RPC の結果で判定） */
export function isSurveyPending(data: SurveyReadResult | null | undefined, now: Date): boolean {
  if (!data?.survey_enabled) return false
  if (data.survey_url) return false // 外部フォームは回答状況が分からないので出さない
  if (!data.questions?.length) return false
  if (data.existing_response_id) return false
  if (data.survey_deadline_at && new Date(data.survey_deadline_at).getTime() <= now.getTime()) return false
  return true
}

/**
 * 確定した（公演日が今日以降の）貸切ごとに、自分のアンケートが未回答かを読む。
 * 対象は確定済みの未来の貸切だけ（通常 0〜2 件）なので、グループごとに 1 回ずつ読む。
 */
export function usePrivateSurveyStatusQuery(groups: PrivateGroupSummary[], todayYmd: string) {
  const targets = groups.filter(g => g.status === 'confirmed' && g.my_member_id && g.schedule && g.schedule.date >= todayYmd)
  const key = targets.map(g => `${g.id}:${g.my_member_id}`).sort()
  return useQuery({
    queryKey: ['mypage-private-survey-status', key] as const,
    enabled: targets.length > 0,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const now = new Date()
      const entries = await Promise.all(targets.map(async g => {
        const { data, error } = await privateGroupMemberAction(g.id, g.my_member_id!, 'survey_read')
        if (error) {
          logger.warn('アンケートの回答状況を取得できませんでした', { groupId: g.id, error })
          return [g.id, false] as const
        }
        return [g.id, isSurveyPending(data as SurveyReadResult, now)] as const
      }))
      return Object.fromEntries(entries)
    },
  })
}
