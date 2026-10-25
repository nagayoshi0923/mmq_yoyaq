/**
 * 作品ページ（表示中の組織）の貸切の受付状況。判定は lib/privateBookingAcceptance の privateBookingStatusWithStores。
 * - 貸切受付 ON/OFF・出張限定・貸切募集期間・公演可能店舗: 作品ページの読み込み（公開 API）の値。列が欠けていたら unknown
 * - 公演期間: 公開ビューから読む
 * - 受付締切・受付範囲の日数: 作品の値（保存の判定と同じ RPC）
 * - 店舗の貸切募集停止（I6）: 上演できる店舗について、受付対象期間の公演日で見る
 * どれかを読めない間・読めなかったときは unknown（「貸切受付中」を出さない）。
 */
import { useEffect, useState } from 'react'
import { scenarioPageReadApi } from '@/lib/api/scenarioPageReadApi'
import { publicBookingReadApi } from '@/lib/api/publicBookingReadApi'
import {
  privateBookingDateWindow,
  privateBookingStatus,
  privateBookingStatusWithStores,
  type PrivateBookingStatus,
  type PrivateBookingStatusInput,
} from '@/lib/privateBookingAcceptance'
import { todayJst } from '@/lib/publicPerformanceSearch'
import { isStorePlayableForScenario } from '@/lib/scenarioStoreHint'
import type { StoreRecruitmentPausePeriod } from '@/lib/storeRecruitmentPause'
import { daysKey, fetchPrivateBookingDays } from '@/components/public-top/privateBookingStatus'
import { logger } from '@/utils/logger'

type ScenarioInput = Omit<PrivateBookingStatusInput, 'available_until'> & {
  scenario_master_id: string
  available_stores?: string[] | null
  private_booking_fields_complete?: boolean
}
type StoreInput = { id: string; ownership_type?: string | null; is_temporary?: boolean | null; status?: string | null }

interface Loaded {
  key: string
  available_from: string | null
  available_until: string | null
  pauses: Array<StoreRecruitmentPausePeriod & { organization_id?: string }>
  days: { deadlineDays: number; horizonDays: number } | null
}

export function useScenarioPrivateBookingStatus(
  organizationId: string | null | undefined,
  scenario: ScenarioInput | null | undefined,
  stores: readonly StoreInput[] | null | undefined,
): PrivateBookingStatus {
  const masterId = scenario?.scenario_master_id ?? null
  const storeKey = (stores ?? []).map((s) => s.id).sort().join(',')
  const key = organizationId && masterId && stores ? `${organizationId}:${masterId}:${storeKey}` : null
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!organizationId || !masterId || !key) return
    let cancelled = false
    const ids = storeKey ? storeKey.split(',') : []
    Promise.all([
      scenarioPageReadApi.findScenarioPerformancePeriod(organizationId, masterId),
      ids.length > 0 ? publicBookingReadApi.listPrivatePauses(ids) : Promise.resolve({ data: [], error: null }),
      fetchPrivateBookingDays([{ organizationId, scenarioId: masterId }]),
    ]).then(([period, pauses, days]) => {
      if (cancelled) return
      if (period.error || !period.data || pauses.error) {
        logger.warn('作品の公演期間・貸切の募集停止を読めませんでした（貸切受付中は出さない）', period.error ?? pauses.error)
        return
      }
      setLoaded({
        key,
        available_from: period.data.available_from ?? null,
        available_until: period.data.available_until ?? null,
        pauses: (pauses.data ?? []) as Loaded['pauses'],
        days: days.get(daysKey(organizationId, masterId)) ?? null,
      })
    }).catch((error) => logger.warn('貸切受付の状況を読めませんでした', error))
    return () => { cancelled = true }
  }, [organizationId, masterId, key, storeKey])

  if (!scenario || !stores || !organizationId || !key || loaded?.key !== key) return 'unknown'
  if (scenario.private_booking_fields_complete !== true) return 'unknown'
  const today = todayJst(new Date())
  const base = privateBookingStatus({ ...scenario, available_until: loaded.available_until }, today)
  if (base !== 'accepting') return base
  if (!loaded.days) return 'unknown'
  const playable = stores.filter((s) => isStorePlayableForScenario(
    { id: s.id, ownership_type: s.ownership_type ?? null, is_temporary: s.is_temporary ?? null, status: s.status ?? null },
    scenario.available_stores,
  )).map((s) => s.id)
  const window = privateBookingDateWindow({
    todayJst: today, deadlineDays: loaded.days.deadlineDays, horizonDays: loaded.days.horizonDays,
    available_from: loaded.available_from, available_until: loaded.available_until,
  })
  // DB と同じく、その組織の停止だけを見る
  const pauses = loaded.pauses.filter((p) => !p.organization_id || p.organization_id === organizationId)
  return privateBookingStatusWithStores({ ...scenario, available_until: loaded.available_until }, playable, pauses, window, today)
}
