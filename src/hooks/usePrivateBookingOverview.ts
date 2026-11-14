// 作品ページの貸切タブの「近い空き・月ごとの空き数」用に、申し込める範囲全体の空き状況を読む（段階1、QW-20261114-001）。
// 空き判定は DB（private_booking_candidate_slot_availability）。1 回の問い合わせは 62 日までなので 60 日ずつに分けて読む。
// 仕様の正本: docs/product-spec/貸切受付ルール.md。変更時は同じ PR で更新。
import { useEffect, useMemo, useState } from 'react'
import { logger } from '@/utils/logger'
import {
  buildCandidateSlotAvailability,
  fetchCandidateSlotAvailability,
  type CandidateSlotAvailability,
  type CandidateSlotAvailabilityTarget,
} from '@/lib/candidateSlotAvailability'
import { splitDateRange } from '@/lib/privateBookingOverview'

const EMPTY: CandidateSlotAvailability = { slotsByDate: {}, unavailableReasons: {} }

export function usePrivateBookingOverview(target: CandidateSlotAvailabilityTarget | null, fromYmd: string | null, toYmd: string | null) {
  const [availability, setAvailability] = useState<CandidateSlotAvailability>(EMPTY)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const targetKey = target
    ? target.kind === 'group'
      ? `group:${target.groupId}`
      : `scenario:${target.organizationId}:${target.scenarioId}:${[...target.storeIds].sort().join(',')}`
    : null
  const requestKey = targetKey && fromYmd && toYmd && fromYmd <= toYmd ? `${targetKey}|${fromYmd}|${toYmd}` : null

  useEffect(() => {
    if (!requestKey || !target || !fromYmd || !toYmd) {
      setAvailability(EMPTY)
      setLoadedKey(null)
      setError(null)
      return
    }
    let cancelled = false
    setError(null)
    Promise.all(splitDateRange(fromYmd, toYmd).map(r => fetchCandidateSlotAvailability(target, r.from, r.to)))
      .then(chunks => {
        if (cancelled) return
        setAvailability(buildCandidateSlotAvailability(chunks.flat()))
        setLoadedKey(requestKey)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        logger.error('Failed to load private booking overview', err)
        setAvailability(EMPTY)
        setLoadedKey(requestKey)
        setError('空き状況の一覧を読み込めませんでした')
      })
    return () => {
      cancelled = true
    }
    // target は targetKey で比較する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const loading = requestKey !== null && loadedKey !== requestKey
  const ready = requestKey !== null && loadedKey === requestKey && !error
  return useMemo(() => ({ availability, loading, ready, error }), [availability, loading, ready, error])
}
