import { readPrivateGroupList } from '@/lib/privateGroupRead'
import { RESERVATION_SOURCE } from '@/lib/constants'
import { getGroupsSurveySettings } from '@/lib/groupSurveySettings'
import { useState, useEffect, useCallback, useRef } from 'react'
import { privateBookingMgmtReadApi } from '@/lib/api/privateBookingMgmtReadApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { boundedBatches } from '@/lib/boundedBatches'
import { fetchBookingRows } from '../utils/fetchBookingRows'
import { getErrorMessage } from '@/lib/errorFields'
import type { PrivateGroup } from '@/types'

export interface PrivateGroupListItem {
  id: string
  invite_code: string
  status: string
  organizer_id: string
  scenario_master_id: string
  created_at: string
  updated_at: string
  /**
   * 予約・履歴・アンケート設定・確定公演（後から埋める列）を読み終えたか。
   * false の間は予約番号での検索・確定日・担当・店舗・アンケート絞り込みに使えない（画面はスケルトン）。
   */
  details_loaded: boolean
  reservation_numbers?: string[]
  survey_enabled?: boolean
  confirmed_date?: string         // 確定した公演日（YYYY-MM-DD）
  confirmed_time?: string         // 確定した公演時間（HH:MM〜HH:MM）
  confirmed_gm_name?: string      // 確定したGM名
  confirmed_store_name?: string   // 確定した店舗名
  confirmed_warning?: string
  scenario_masters: {
    id: string
    title: string
    key_visual_url?: string
    player_count_max?: number
  } | null
  members: Array<{
    id: string
    user_id: string | null
    guest_name: string | null
    is_organizer: boolean
    member_name?: string | null
  }>
  candidate_dates: Array<{
    id: string
    date: string
    time_slot: string
    responses: Array<{
      id: string
      member_id: string
      response: string
    }>
  }>
  organizer?: {
    name: string
    nickname?: string
    email?: string
  }
}

interface UsePrivateGroupListReturn {
  groups: PrivateGroupListItem[]
  /** 一覧の最初の 100 件がまだ届いていない（この間だけ「読み込み中」） */
  loading: boolean
  /** グループ本体の続き（100 件ずつ）を読んでいる */
  loadingMore: boolean
  /** 予約・履歴・アンケート設定など後から埋める列を読んでいる */
  detailsLoading: boolean
  error: string | null
  loadGroups: () => Promise<void>
}

/** グループ本体だけで出せる一覧の行（グループ名・作品・状態・主催者・候補日・更新日）。後から埋める列は未読み込み。 */
export function toBaseListItem(g: PrivateGroup): PrivateGroupListItem {
  // 古い応答で作品が配列のまま届く場合に備える（従来の一覧と同じ扱い）
  const scenarioMasters: unknown = g.scenario_masters
  return {
    ...(g as unknown as PrivateGroupListItem),
    details_loaded: false,
    scenario_masters: ((Array.isArray(scenarioMasters) ? scenarioMasters[0] : scenarioMasters) || null) as PrivateGroupListItem['scenario_masters'],
    members: (g.members || []).map(m => ({
      ...m,
      member_name: m.staff_display_name || m.guest_name || null,
    })),
    organizer: { name: g.organizer_display_name || '幹事情報を確認できません' },
  }
}

export function usePrivateGroupList(): UsePrivateGroupListReturn {
  const [groups, setGroups] = useState<PrivateGroupListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 再読み込みで前の読み込みの結果が後から届いても上書きしない
  const loadSeq = useRef(0)

  const loadGroups = useCallback(async () => {
    const seq = ++loadSeq.current
    const current = () => seq === loadSeq.current
    setLoading(true)
    setLoadingMore(true)
    setDetailsLoading(true)
    setError(null)
    setGroups([])

    try {
      const orgId = await getCurrentOrganizationId()
      // 組織の解決を待つ間に新しい読み込みが始まっていたら、古い呼び出しは error も loading も触らない。
      // 古い呼び出しの「組織なし」が、新しい呼び出しで出た一覧をエラー表示に変えるのを防ぐ（Codex 第2回再レビュー R6）
      if (!current()) return
      if (!orgId) {
        setError('組織情報が取得できません')
        return
      }

      // 先に 100 件ずつ軽い情報だけで一覧を出す（検索欄もここで出る）。後から埋める列はスケルトン。
      const data = await readPrivateGroupList('staff', orgId, undefined, loaded => {
        if (!current()) return
        setGroups(loaded.map(toBaseListItem))
        setLoading(false)
      })
      if (!current()) return
      const baseGroups = data.map(toBaseListItem)
      setGroups(baseGroups)
      setLoading(false)
      setLoadingMore(false)

      const groupIds = (data || []).map(g => g.id)

      const reservationIds = [...new Set(data.map(g => g.reservation_id).filter((id): id is string => !!id))]
      // 表示名は認可済みsnapshotに含まれる。顧客テーブルを再取得しない。
      // 各フェーズを待ち合わせ、一覧全体でも同時要求を最大3件に保つ。
      const surveyResult = await getGroupsSurveySettings(groupIds)
      const bookingRows = await boundedBatches(reservationIds, 50, 3, async ids => {
        const result = await privateBookingMgmtReadApi.listPrivateReservationsByIds(orgId, ids)
        if (result.error) throw result.error
        return result.data || []
      })
      // 検索用の予約番号は、取消・再申込前の予約も含めて取得する。
      const historyRows = await boundedBatches(groupIds, 50, 3, ids => fetchBookingRows((from, to) =>
        privateBookingMgmtReadApi.listReservationsByGroupIds(orgId, ids, from, to),
      ))
      const reservationNumbers = new Map<string, string[]>()
      for (const reservation of historyRows) {
        if (!reservation.private_group_id || !reservation.reservation_number) continue
        const numbers = reservationNumbers.get(reservation.private_group_id) || []
        numbers.push(reservation.reservation_number)
        reservationNumbers.set(reservation.private_group_id, numbers)
      }
      const currentReservation = new Map(data.map(g => [g.id, g.reservation_id]))
      const eventIds = [...new Set(bookingRows.map(r => r.schedule_event_id).filter((id): id is string => !!id))]
      const eventRows = await boundedBatches(eventIds, 50, 3, async ids => {
        const result = await privateBookingMgmtReadApi.listEventsByIds(orgId, ids)
        if (result.error) throw result.error
        return result.data || []
      })
      const events = new Map(eventRows.map(event => [event.id, event]))

      // グループIDごとの現在公演日・時間・担当名・店舗IDマップ
      const confirmedDateMap = new Map<string, string>()
      const confirmedTimeMap = new Map<string, string>()
      const confirmedGmNameMap = new Map<string, string>()
      const confirmedStoreIdMap = new Map<string, string>()
      bookingRows.forEach(req => {
        if (!req.private_group_id || currentReservation.get(req.private_group_id) !== req.id) return
        if (!['confirmed', 'gm_confirmed', 'checked_in', 'completed', 'no_show'].includes(req.status)) return
        const event = events.get(req.schedule_event_id)
        if (!event || event.is_cancelled || !event.date || !event.start_time || !event.end_time) return
        confirmedDateMap.set(req.private_group_id, event.date)
        confirmedTimeMap.set(req.private_group_id, `${event.start_time.slice(0, 5)}〜${event.end_time.slice(0, 5)}`)
        confirmedGmNameMap.set(req.private_group_id, (event.gms || []).filter(Boolean).join('・'))
        if (event.store_id) confirmedStoreIdMap.set(req.private_group_id, event.store_id)
      })

      // 店舗名を一括取得（先行フェーズ完了後に実行し、一覧全体の同時要求を最大3件に保つ）
      const storeIds = [...new Set([...confirmedStoreIdMap.values()].filter(Boolean))]
      const storeNameMap = new Map<string, string>()
      if (storeIds.length > 0) {
        const storeRows = await boundedBatches(storeIds, 50, 3, async ids => {
          const result = await privateBookingMgmtReadApi.listStoresByIds(orgId, ids)
          if (result.error) throw result.error
          return result.data || []
        })
        storeRows.forEach((s: { id: string; name?: string | null; short_name?: string | null }) => {
          storeNameMap.set(s.id, s.short_name || s.name || '')
        })
      }

      const groupsWithOrganizer: PrivateGroupListItem[] = baseGroups.map(g => {
        const storeId = confirmedStoreIdMap.get(g.id)
        return {
          ...g,
          details_loaded: true,
          reservation_numbers: [...new Set(reservationNumbers.get(g.id) || [])],
          survey_enabled: surveyResult[g.id]?.survey_enabled ?? false,
          confirmed_date: confirmedDateMap.get(g.id),
          confirmed_time: confirmedTimeMap.get(g.id),
          confirmed_gm_name: confirmedGmNameMap.get(g.id),
          confirmed_store_name: storeId ? storeNameMap.get(storeId) : undefined,
          confirmed_warning: g.status === 'confirmed' && !confirmedDateMap.has(g.id)
            ? '現在の予約と公演の対応を確認できません。予約詳細を確認してください。' : undefined,
        }
      })

      if (!current()) return
      setGroups(groupsWithOrganizer)
    } catch (err) {
      if (!current()) return
      logger.error('グループ一覧の取得エラー:', err)
      // 一部だけ読めた一覧を正しいデータとして残さない（確定日・予約番号が欠けたまま見せない）
      setGroups([])
      setError(getErrorMessage(err) || 'グループ一覧の取得に失敗しました')
    } finally {
      if (current()) {
        setLoading(false)
        setLoadingMore(false)
        setDetailsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  return { groups, loading, loadingMore, detailsLoading, error, loadGroups }
}
