import { useEffect, useRef } from 'react'
import { toJstYmd } from '@/utils/jstDate'
import type { TimeSlot } from '../utils/types'
import {
  clearPrivateBookingTabDraft,
  privateBookingTabDraftOwner,
  privateBookingTabDraftScope,
  readPrivateBookingTabDraft,
  savePrivateBookingTabDraft,
} from '../privateBookingTabDraft'

/**
 * 作品ページの貸切タブの選択（候補日時・店舗・表示月・タブ）を、同じタブの中で預かって戻す（B29。privateBookingTabDraft.ts）。
 * - 戻すのは 1 回だけ（作品・店舗・ログインの状態が読めてから）。URL が日付・枠などを指定しているときは URL を優先して戻さない
 * - 戻すまでは預け直さない（読み込み直後の空の状態で預かりを上書きしない）
 */
export function usePrivateBookingTabDraft(input: {
  /** 組織・作品・ログインの状態が読めたか（読めるまで戻さない） */
  ready: boolean
  organizationId: string | null | undefined
  scenarioMasterId: string | null | undefined
  userId: string | null | undefined
  acceptsPrivateBooking: boolean
  availableStoreIds: readonly string[]
  activeTab: 'schedule' | 'private'
  setActiveTab: (tab: 'schedule' | 'private') => void
  selectedTimeSlots: Array<{ date: string; slot: TimeSlot }>
  setSelectedTimeSlots: (slots: Array<{ date: string; slot: TimeSlot }>) => void
  selectedStoreIds: string[]
  setSelectedStoreIds: (ids: string[]) => void
  currentMonth: Date
  showMonthOf: (date: string) => void
}) {
  const { ready, organizationId, scenarioMasterId, userId, acceptsPrivateBooking, availableStoreIds, activeTab, setActiveTab,
    selectedTimeSlots, setSelectedTimeSlots, selectedStoreIds, setSelectedStoreIds, currentMonth, showMonthOf } = input
  const scope = organizationId && scenarioMasterId ? privateBookingTabDraftScope(organizationId, scenarioMasterId) : null
  const owner = privateBookingTabDraftOwner(userId)
  // 戻したかどうかは「作品と利用者」の組ごと（ログインで利用者が変わったら、未ログインの預かりの引き継ぎを 1 回試す）
  const restoreKey = scope ? `${scope}|${owner}` : null
  const restoredKeyRef = useRef<string | null>(null)
  /** 戻す・切り替えで画面の選択を変えた直後の 1 回は預け直さない（変わる前の選択を新しい範囲へ預けない） */
  const skipSaveRef = useRef(false)

  // 戻す（作品と利用者の組ごとに 1 回）
  useEffect(() => {
    if (!ready || !scope || !restoreKey || restoredKeyRef.current === restoreKey) return
    const previous = restoredKeyRef.current
    restoredKeyRef.current = restoreKey
    if (previous?.startsWith(`${scope}|`)) {
      // 同じ作品で利用者だけ変わった。未ログイン → ログインは、画面の選択をそのまま続ける（次の預け直しで持ち主を更新する）。
      // ログイン済みの利用者 → ログアウト・別の利用者は、その人の選択を次の人へ残さない
      const previousOwner = previous.slice(scope.length + 1)
      if (previousOwner !== 'anon') {
        clearPrivateBookingTabDraft()
        setSelectedTimeSlots([])
      }
      return
    }
    if (previous) {
      // 同じ画面のまま別の作品・組織へ切り替わった: 前の作品の候補・店舗を持ち込まない（新しい作品の初めの状態にしてから、その作品の預かりを戻す）
      skipSaveRef.current = true
      setSelectedTimeSlots([])
      setSelectedStoreIds([...availableStoreIds])
      setActiveTab('schedule')
    }
    const params = new URLSearchParams(window.location.search)
    if (params.get('date') || params.get('slot') || params.get('store') || params.get('stores')) return
    if (!acceptsPrivateBooking) return
    const draft = readPrivateBookingTabDraft(scope, owner, toJstYmd(new Date()))
    if (!draft) return
    skipSaveRef.current = true
    const storeIds = draft.storeIds.filter((id) => availableStoreIds.includes(id))
    if (storeIds.length > 0) {
      setSelectedStoreIds(storeIds)
      if (draft.timeSlots.length > 0) setSelectedTimeSlots(draft.timeSlots)
    } else {
      // 預けた店舗がどれも選べない（休止・作品の対象外など）: 候補を別の店舗へ広げず、店舗を選び直す状態にする（候補も戻さない）
      setSelectedStoreIds([])
      setSelectedTimeSlots([])
    }
    showMonthOf(`${draft.month}-01`)
    if (draft.tab === 'private') setActiveTab('private')
  }, [ready, scope, restoreKey, owner, acceptsPrivateBooking, availableStoreIds, setSelectedStoreIds, setSelectedTimeSlots, showMonthOf, setActiveTab])

  // 預け直す（戻したあと、選択が変わるたび）
  const month = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
  const slotsKey = JSON.stringify(selectedTimeSlots.map((t) => [t.date, t.slot.label, t.slot.startTime, t.slot.endTime]))
  const storesKey = selectedStoreIds.join(',')
  useEffect(() => {
    if (!scope || restoredKeyRef.current !== restoreKey) return
    if (skipSaveRef.current) { skipSaveRef.current = false; return }
    if (activeTab !== 'private' && selectedTimeSlots.length === 0) { clearPrivateBookingTabDraft(); return }
    savePrivateBookingTabDraft({
      scope,
      owner,
      tab: activeTab,
      timeSlots: selectedTimeSlots.map((t) => ({ date: t.date, slot: { label: t.slot.label, startTime: t.slot.startTime, endTime: t.slot.endTime } })),
      storeIds: selectedStoreIds,
      month,
    })
    // slotsKey・storesKey で中身の変化を見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, restoreKey, owner, activeTab, slotsKey, storesKey, month])
}
