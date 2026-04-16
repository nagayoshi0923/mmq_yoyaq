import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PrivateBookingRequest } from './PrivateBookingRequest/index'
import { scenarioApi, storeApi } from '@/lib/api'
import { useOrganization } from '@/hooks/useOrganization'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { logger } from '@/utils/logger'
import { supabase } from '@/lib/supabase'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import { computePrivateBookingSlots } from '@/lib/computePrivateBookingSlots'
import { updatePrivateGroupStatus } from '@/lib/privateGroupStatus'

interface TimeSlot {
  label: string
  startTime: string
  endTime: string
}

interface PrivateBookingRequestPageProps {
  organizationSlug?: string
}

function slotParamToKey(param: string): 'morning' | 'afternoon' | 'evening' | null {
  const map: Record<string, 'morning' | 'afternoon' | 'evening'> = {
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    午前: 'morning',
    午後: 'afternoon',
    夜: 'evening',
  }
  return map[param] ?? null
}

export function PrivateBookingRequestPage({ organizationSlug }: PrivateBookingRequestPageProps) {
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const { isCustomHoliday, isLoading: customHolidaysLoading } = useCustomHolidays({ organizationSlug })
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
  const groupId = urlParams.get('groupId') || ''

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
  const urlSlotPrefillKey = `${scenarioId}|${date}|${storeId}|${slotParam}`

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // シナリオデータを取得
      const scenarios = await scenarioApi.getAll()
      const foundScenario = isUuidLike(scenarioId) ? scenarios.find((s: any) => s.id === scenarioId) : null
      
      if (!foundScenario) {
        logger.error('シナリオが見つかりません')
        return
      }
      
      setScenario(foundScenario)
      
      // 店舗データを取得
      const storesData = await storeApi.getAll()
      setStores(storesData)
      
      // URLパラメータから選択済み店舗を設定（カンマ区切り対応）
      const storeIds = storeId.split(',').filter(id => 
        isUuidLike(id) && storesData.some((s: any) => s.id === id)
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

  // URL の slot を営業時間マージ（貸切確認の候補追加と同ロジック）で開始時刻に解決
  useEffect(() => {
    if (urlSlotPrefillAppliedForKeyRef.current === urlSlotPrefillKey) return
    if (loading || !scenario || customHolidaysLoading) return

    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || !slotParam) {
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      return
    }

    const slotKey = slotParamToKey(slotParam)
    if (!slotKey) {
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      return
    }

    const urlStoreIds = storeId.split(',').filter(
      (id) => isUuidLike(id) && stores.some((s: any) => s.id === id)
    )
    const scenarioStoreIds: string[] = Array.isArray(scenario.available_stores)
      ? scenario.available_stores.filter((id: unknown) => typeof id === 'string')
      : []
    const eligible = stores.filter(
      (s: any) =>
        s.ownership_type !== 'office' &&
        s.status === 'active' &&
        (scenarioStoreIds.length === 0 || scenarioStoreIds.includes(s.id))
    )
    const storeIdsForSlots =
      urlStoreIds.length > 0
        ? urlStoreIds.filter((id) => eligible.some((s: any) => s.id === id))
        : eligible.map((s: any) => s.id)

    if (storeIdsForSlots.length === 0) {
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      return
    }

    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('business_hours_settings')
        .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
        .in('store_id', storeIdsForSlots)
      if (cancelled) return
      if (error) {
        logger.error('貸切リクエストページ: 営業時間取得エラー', error)
        if (!cancelled) urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
        return
      }
      const map = new Map<string, BusinessHoursSettingRow>()
      for (const row of data || []) {
        map.set(row.store_id as string, row as BusinessHoursSettingRow)
      }
      const scenarioDur =
        typeof scenario.duration === 'number' && scenario.duration > 0 ? scenario.duration : 180
      const weekendDur =
        typeof scenario.weekend_duration === 'number' && scenario.weekend_duration > 0
          ? scenario.weekend_duration
          : null
      const slots = computePrivateBookingSlots({
        date,
        storeIds: storeIdsForSlots,
        businessHoursByStore: map,
        scenarioTiming: { duration: scenarioDur, weekend_duration: weekendDur },
        allStoreEvents: [],
        isCustomHoliday,
        privateBookingTimeSlots: Array.isArray(scenario.private_booking_time_slots)
          ? scenario.private_booking_time_slots
          : undefined,
      })
      const found = slots.find((s) => s.key === slotKey)
      if (cancelled) return
      urlSlotPrefillAppliedForKeyRef.current = urlSlotPrefillKey
      if (found) {
        setSelectedTimeSlots([
          {
            date,
            slot: {
              label: found.label,
              startTime: found.startTime,
              endTime: found.endTime,
            },
          },
        ])
      }
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
    storeId,
    isCustomHoliday,
    customHolidaysLoading,
    urlSlotPrefillKey,
  ])

  const handleBack = () => {
    window.history.back()
  }

  const handleComplete = async () => {
    // グループIDがある場合、グループのステータスを更新
    if (groupId) {
      try {
        await updatePrivateGroupStatus(groupId, 'booking_requested')
        logger.log('グループステータスを booking_requested に更新:', groupId)
      } catch (error) {
        logger.error('グループステータス更新エラー:', error)
      }
    }
    // 完了後の処理（トップページへ遷移など）
    navigate(bookingBasePath)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">シナリオが見つかりません</p>
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
      participationFee={scenario.participation_fee || 0}
      maxParticipants={scenario.player_count_max || 8}
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
      organizationSlug={organizationSlug}
      groupId={groupId || undefined}
      onBack={handleBack}
      onComplete={handleComplete}
    />
  )
}

