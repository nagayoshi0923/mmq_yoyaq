// 貸切の候補日時の選択（空き判定は DB の private_booking_candidate_slot_availability 系）。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { logger } from '@/utils/logger'
import {
  buildCandidateSlotAvailability,
  fetchCandidateSlotAvailability,
  type CandidateSlotAvailability,
  type CandidateSlotAvailabilityTarget,
} from '@/lib/candidateSlotAvailability'

const EMPTY: CandidateSlotAvailability = { slotsByDate: {}, unavailableReasons: {} }

/**
 * 表示中の日付（dates）の空き状況を DB から読む。target が null・dates が空なら読まない。
 * 画面側で空きを計算しない（判定は DB と一本化）。
 */
export function useCandidateSlotAvailability(target: CandidateSlotAvailabilityTarget | null, dates: string[]) {
  const [availability, setAvailability] = useState<CandidateSlotAvailability>(EMPTY)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const from = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null
  const to = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
  const targetKey = target
    ? target.kind === 'group'
      ? `group:${target.groupId}`
      : `scenario:${target.organizationId}:${target.scenarioId}:${[...target.storeIds].sort().join(',')}`
    : null
  const requestKey = targetKey && from && to ? `${targetKey}|${from}|${to}|${reloadToken}` : null

  useEffect(() => {
    if (!requestKey || !target || !from || !to) {
      setAvailability(EMPTY)
      setLoadedKey(null)
      setError(null)
      return
    }
    let cancelled = false
    setError(null)
    fetchCandidateSlotAvailability(target, from, to)
      .then(rows => {
        if (cancelled) return
        setAvailability(buildCandidateSlotAvailability(rows))
        setLoadedKey(requestKey)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        logger.error('Failed to load candidate slot availability', err)
        setAvailability(EMPTY)
        setLoadedKey(requestKey)
        setError('空き状況を読み込めませんでした。時間をおいて開き直してください。')
      })
    return () => {
      cancelled = true
    }
    // target は targetKey で比較する（呼出側の再生成で読み直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const reload = useCallback(() => setReloadToken(n => n + 1), [])
  const loading = requestKey !== null && loadedKey !== requestKey
  const ready = requestKey !== null && loadedKey === requestKey && !error

  return useMemo(() => ({ availability, loading, ready, error, reload }), [availability, loading, ready, error, reload])
}
