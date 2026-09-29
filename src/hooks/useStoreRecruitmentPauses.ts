import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '@/lib/api/storeApi'
import { getStoreRecruitmentPauseKind, recruitmentPauseCellLabel } from '@/lib/storeRecruitmentPause'

/**
 * 組織の全店舗の募集停止期間（QW-20260909-011）を取得し、スケジュールのセル表示用ラベルを返す。
 * 取得に失敗してもスケジュールは表示を続ける（ラベルが出ないだけ）。
 */
export function useStoreRecruitmentPauseLabels(enabled: boolean) {
  const { data: periods = [] } = useQuery({
    queryKey: ['store-recruitment-pauses'],
    queryFn: () => storeApi.getAllRecruitmentPauses(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  return useCallback(
    (date: string, storeId: string) => recruitmentPauseCellLabel(getStoreRecruitmentPauseKind(date, storeId, periods), false),
    [periods],
  )
}
