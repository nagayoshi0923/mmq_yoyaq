import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivateBookingRequest } from './PrivateBookingRequest/index'
import { scenarioApi, storeApi } from '@/lib/api'
import { useOrganization } from '@/hooks/useOrganization'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { logger } from '@/utils/logger'
import {
  availableSlotsForDate,
  buildCandidateSlotAvailability,
  fetchCandidateSlotAvailability,
} from '@/lib/candidateSlotAvailability'
import { isScenarioAcceptingPrivateBooking } from '@/lib/privateBookingAcceptance'
import { isStorePlayableForScenario } from '@/lib/scenarioStoreHint'
import { resolveOrganizationFromPathSegment } from '@/lib/organization'
import {
  resolvePrivateBookingUrlPrefillSlot,
  slotParamToKey,
} from '@/lib/privateBookingUrlPrefill'
import { isBeyondPrivateBookingHorizon, privateBookingTooFarText, usePrivateBookingHorizonDays } from '@/lib/privateBookingHorizon'
import { PrivateBookingHorizonNotice } from '@/components/private-booking/PrivateBookingHorizonNotice'

interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

interface PrivateBookingRequestPageProps {
  organizationSlug?: string
}

export function PrivateBookingRequestPage({ organizationSlug }: PrivateBookingRequestPageProps) {
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const { isLoading: customHolidaysLoading } = useCustomHolidays({ organizationSlug })
  /** 同一URLでの二重適用防止（クエリが変われば再適用） */
  const urlSlotPrefillAppliedForKeyRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scenario, setScenario] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Array<{date: string, slot: TimeSlot}>>([])
  
  // 予約サイトのベースパス（propsから優先）
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : (organization?.slug ? `/${organization.slug}` : '/queens-waltz')
  
  // URLパラメータから情報を取得（パスベース）
  const urlParams = new URLSearchParams(window.location.search)
  const scenarioId = urlParams.get('scenario') || ''
  const dateParam = urlParams.get('date') || ''
  const storeId = urlParams.get('store') || ''
  const slotParam = urlParams.get('slot') || ''
  const timeParam = urlParams.get('time') || ''
  const groupId = urlParams.get('groupId') || ''
  const participantParam = Number(urlParams.get('participants'))
  const selectedParticipants = Number.isInteger(participantParam) && participantParam >= (scenario?.player_count_min || 1) && participantParam <= (scenario?.player_count_max || 8) ? participantParam : (scenario?.player_count_max || 8)

  const isUuidLike = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  
  // 日付を正しいフォーマットに変換
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    // 時間帯文字列の場合は空文字を返す
    if (['morning', 'afternoon', 'evening'].includes(dateStr)) {
      return ''
    }
    // dateStrが数値のみの場合、現在の月の日付として扱う
    if (/^\d+$/.test(dateStr)) {
      const today = new Date()
      const year = today.getFullYear()
      const month = today.getMonth() + 1
      return `${year}-${String(month).padStart(2, '0')}-${String(dateStr).padStart(2, '0')}`
    }
    // YYYY-MM-DD形式かチェック
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr
    }
    return ''
  }
  
  const date = formatDate(dateParam)
  // 申し込める範囲（今日から N 日先まで。MMQ 既定 180 → 組織 → 作品の設定。I21）。
  // カレンダー・リストの「貸切申込」から渡る ?date= がこれより先なら、理由を出して申込フォームへ進めない（2026-10-20 本番 #1140）
  const horizon = usePrivateBookingHorizonDays({ organizationId: scenario?.organization_id ?? null, scenarioId: scenario?.id ?? null })
  const dateTooFar = Boolean(date) && isBeyondPrivateBookingHorizon(date, horizon.days)
  const urlSlotPrefillKey = `${scenarioId}|${date}|${storeId}|${slotParam}|${timeParam}`

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      let orgId: string | undefined = organization?.id
      if (!orgId && organizationSlug) {
        const org = await resolveOrganizationFromPathSegment(organizationSlug, { requireActive: true })
        orgId = org?.id
      }

      // シナリオデータを取得（顧客は org 付き getById、スタッフは一覧フォールバック）
      let foundScenario: any = null
      if (isUuidLike(scenarioId) && orgId) {
        foundScenario = await scenarioApi.getById(scenarioId, orgId).catch(() => null)
      }
      if (!foundScenario && !orgId && !organizationSlug) {
        const scenarios = await scenarioApi.getAll().catch(() => [])
        foundScenario = isUuidLike(scenarioId) ? scenarios.find((s) => s.id === scenarioId) : null
      }

      if (!foundScenario) {
        logger.error('シナリオが見つかりません')
        return
      }

      if (!isScenarioAcceptingPrivateBooking(foundScenario)) {
        logger.error('貸切受付が停止されているシナリオです')
        setScenario({ ...foundScenario, __privateBookingBlocked: true })
        return
      }

      setScenario(foundScenario)

      // 店舗データを取得
      // 顧客は /api/stores（requireStaff）にアクセスできないため
      // scenario.organization_id がわかった時点で stores_public 経由で取得
      let storesData: any[] = []
      const orgIdForStores = foundScenario.organization_id
      if (orgIdForStores) {
        try {
          storesData = await storeApi.getAllPublicForCustomer(orgIdForStores)
        } catch {
          // フォールバック: スタッフとしてログイン中ならバックエンド API も試みる
          try { storesData = await storeApi.getAll() } catch { /* ignore */ }
        }
      } else {
        try { storesData = await storeApi.getAll() } catch { /* ignore */ }
      }
      setStores(storesData)
      
      // URLパラメータから選択済み店舗を設定（カンマ区切り対応）
      const storeIds = storeId.split(',').filter(id => 
        isUuidLike(id) && storesData.some((s) => s.id === id)
      )
      if (storeIds.length > 0) {
        setSelectedStoreIds(storeIds)
      }
    } catch (error) {
      logger.error('データの読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyUrlPrefillSlot = useCallback((
    computedSlots: Array<{ key: string; label: string; startTime: string; endTime: string }>
  ) => {
    const resolved = resolvePrivateBookingUrlPrefillSlot({
      slotParam,
      timeParam,
      computedSlots,
    })
    urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
    if (!resolved) return
    setSelectedTimeSlots([
      {
        date,
        slot: {
          label: resolved.label,
          startTime: resolved.startTime,
          endTime: resolved.endTime,
        },
      },
    ])
  }, [date, slotParam, timeParam, urlSlotPrefillKey])

  // URL の slot/time を営業時間マージで開始時刻に解決。取れなくても候補は落とさない。
  useEffect(() => {
    if (urlSlotPrefillAppliedForKeyRef.current === urlSlotPrefillKey) return
    if (loading || !scenario || customHolidaysLoading) return

    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || !slotParam) {
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      return
    }

    if (!slotParamToKey(slotParam)) {
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      return
    }

    const urlStoreIds = storeId.split(',').filter(
      (id) => isUuidLike(id) && stores.some((s) => s.id === id)
    )
    const scenarioStoreIds: string[] = Array.isArray(scenario.available_stores)
      ? scenario.available_stores.filter((id: unknown) => typeof id === 'string')
      : []
    // 受付できる店舗は DB の判定と同じ（作品の上演店舗の指定が無ければ臨時会場を除く）
    const eligible = stores.filter((s) => s.status === 'active' && isStorePlayableForScenario(s, scenarioStoreIds))
    const storeIdsForSlots =
      urlStoreIds.length > 0
        ? urlStoreIds.filter((id) => eligible.some((s) => s.id === id))
        : eligible.map((s) => s.id)

    // 店舗が解決できない場合でもカレンダー指定の枠は引き継ぐ
    if (storeIdsForSlots.length === 0) {
      applyUrlPrefillSlot([])
      return
    }

    let cancelled = false
    ;(async () => {
      // 候補の時刻は DB の空き判定（private_booking_candidate_slot_availability）から取る。
      // 作品ページ・確認画面の送信前の再検証と同じ判定（仕様の正本: docs/product-spec/貸切受付ルール.md）。
      let slots: ReturnType<typeof availableSlotsForDate> = []
      const organizationIdForSlots = scenario.organization_id as string | undefined
      if (organizationIdForSlots) {
        try {
          const rows = await fetchCandidateSlotAvailability(
            { kind: 'scenario', organizationId: organizationIdForSlots, scenarioId: scenario.id, storeIds: storeIdsForSlots },
            date,
            date,
          )
          slots = availableSlotsForDate(buildCandidateSlotAvailability(rows), date)
        } catch (error) {
          logger.error('貸切リクエストページ: 空き状況取得エラー', error)
        }
      }
      if (cancelled) return
      applyUrlPrefillSlot(slots)
    })()

    return () => {
      cancelled = true
    }
  }, [
    loading,
    scenario,
    stores,
    date,
    slotParam,
    timeParam,
    storeId,
    customHolidaysLoading,
    urlSlotPrefillKey,
    applyUrlPrefillSlot,
  ])

  const handleBack = () => {
    window.history.back()
  }

  // 確認画面で希望店舗を選び直したら、URL の store も合わせる（再読み込み・戻る→進むで同じ店舗に。
  // 画面の移動ではないので履歴は増やさず、ルーターの遷移（先頭へのスクロール・URL からの再適用）も起こさない）
  const handleStoreIdsChange = (ids: string[]) => {
    const params = new URLSearchParams(window.location.search)
    if (ids.length > 0) params.set('store', ids.join(','))
    else params.delete('store')
    const query = params.toString().replace(/%2C/g, ',')
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }

  const handleComplete = async () => {
    // 完了後の処理（トップページへ遷移など）
    navigate(bookingBasePath)
  }

  if (loading || (scenario?.organization_id && !scenario.__privateBookingBlocked && date && horizon.loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!scenario || scenario.__privateBookingBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            {scenario?.__privateBookingBlocked
              ? 'このシナリオは現在貸切リクエストを受け付けていません'
              : 'シナリオが見つかりません'}
          </p>
          <button
            onClick={handleBack}
            className="text-primary hover:underline"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  // 受付範囲を読めなかったときは、既定の 180 日で進めず再試行を出す（組織が 90 日などだと保存で拒否されるため。Codex 点検 不具合 5）
  if (date && horizon.days === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <PrivateBookingHorizonNotice horizon={horizon} className="justify-center text-left" />
          <button onClick={handleBack} className="text-primary hover:underline">戻る</button>
        </div>
      </div>
    )
  }

  if (dateTooFar && horizon.days !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4" role="alert">
          <p className="text-muted-foreground">
            選んだ日（{date}）には貸切を申し込めません。{privateBookingTooFarText(horizon.days)}。
          </p>
          <p className="text-sm text-muted-foreground">カレンダーに戻り、{horizon.days} 日先までの日付を選び直してください。</p>
          <button
            onClick={handleBack}
            className="text-primary hover:underline"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <PrivateBookingRequest
      scenarioTitle={scenario.title}
      scenarioId={scenario.id}
      participationFee={scenario.participation_fee ?? 0}
      participationCosts={scenario.participation_costs}
      maxParticipants={selectedParticipants}
      scenarioDuration={scenario.duration}
      weekendDuration={
        typeof scenario.weekend_duration === 'number' && scenario.weekend_duration > 0
          ? scenario.weekend_duration
          : null
      }
      selectedTimeSlots={selectedTimeSlots}
      selectedStoreIds={selectedStoreIds}
      stores={stores}
      scenarioAvailableStores={scenario.available_stores || []}
      privateBookingTimeSlots={
        Array.isArray(scenario.private_booking_time_slots)
          ? scenario.private_booking_time_slots
          : undefined
      }
      privateBookingTimeSlotsWeekend={
        Array.isArray(scenario.private_booking_time_slots_weekend)
          ? scenario.private_booking_time_slots_weekend
          : null
      }
      scenarioSlotStartTimes={scenario.private_booking_slot_start_times}
      organizationSlug={organizationSlug}
      groupId={groupId || undefined}
      onBack={handleBack}
      onComplete={handleComplete}
      onStoreIdsChange={handleStoreIdsChange}
    />
  )
}
