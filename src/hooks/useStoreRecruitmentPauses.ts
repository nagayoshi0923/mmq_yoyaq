import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { storeApi } from '@/lib/api/storeApi'
import { getStoreRecruitmentPauseKind, recruitmentPauseCellLabel } from '@/lib/storeRecruitmentPause'

/**
 * 組織の全店舗の募集停止期間（QW-20260909-011）を取得し、スケジュールのセル表示用ラベルを返す。
 * 取得に失敗してもスケジュールは表示を続ける（ラベルが出ないだけ）。
 */
/**
 * 組織の全店舗の募集停止期間。承認画面など、最新の停止を確実に反映したい画面向け（#727）。
 * 開くたびに読み直す（アプリ全体の既定は開いたときに読み直さない）。読み終わるまで ready は false。
 */
export function useStoreRecruitmentPausePeriods(enabled: boolean) {
  const query = useQuery({
    queryKey: ['store-recruitment-pauses'],
    queryFn: () => storeApi.getAllRecruitmentPauses(),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  return {
    periods: query.data ?? [],
    ready: Boolean(query.data) && !query.isFetching && !query.isError,
    error: query.error,
    retry: () => query.refetch(),
  }
}

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
