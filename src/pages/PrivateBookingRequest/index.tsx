import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Header } from '@/components/layout/Header'
import { NavigationBar } from '@/components/layout/NavigationBar'
import { Calendar, Clock, Users, MapPin, ArrowLeft, CheckCircle2, AlertCircle, Plus, X, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCustomerData } from '../BookingConfirmation/hooks/useCustomerData'
import { usePrivateBookingForm } from './hooks/usePrivateBookingForm'
import { usePrivateBookingSubmit } from './hooks/usePrivateBookingSubmit'
import { usePrivateGroup } from '@/hooks/usePrivateGroup'
import { logger } from '@/utils/logger'
import { formatDate } from './utils/privateBookingFormatters'
import { BookingNotice } from '../ScenarioDetailPage/components/BookingNotice'
import { useCustomHolidays } from '@/hooks/useCustomHolidays'
import { getPrivateBookingDisplayEndTime } from '@/lib/privateBookingScenarioTime'
import type { BusinessHoursSettingRow } from '@/lib/privateGroupCandidateSlots'
import { computePrivateBookingSlots } from '@/lib/computePrivateBookingSlots'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { PrivateBookingRequestProps, TimeSlot } from './types'
import {
  getPrivateBookingCandidateBlockedState,
  type PrivateBookingBlockedSlotRow,
} from '@/lib/privateBookingBlockedSlotAvailability'
import { resolveOrgIdFromPageContext } from '@/lib/organization'
import type { RpcGetPublicPrivateBookingAvailabilityParams } from '@/lib/rpcTypes'
import { toJstYmd } from '@/utils/jstDate'

const MAX_TIME_SLOTS = 6

export function PrivateBookingRequest({
  scenarioTitle,
  scenarioId,
  participationFee,
  maxParticipants,
  scenarioDuration,
  weekendDuration,
  selectedTimeSlots: initialTimeSlots,
  selectedStoreIds: initialStoreIds,
  stores,
  scenarioAvailableStores,
  privateBookingTimeSlots,
  organizationSlug,
  groupId,
  onBack,
  onComplete
}: PrivateBookingRequestProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { createGroup, loading: groupLoading } = usePrivateGroup()
  
  const { isCustomHoliday } = useCustomHolidays({ organizationSlug })

  const scenarioTiming = useMemo(
    () => ({
      duration: scenarioDuration != null && scenarioDuration > 0 ? scenarioDuration : 180,
      weekend_duration:
        weekendDuration != null && weekendDuration > 0 ? weekendDuration : null,
    }),
    [scenarioDuration, weekendDuration]
  )

  const enrichSlotEnd = useCallback(
    (date: string, slot: TimeSlot): TimeSlot => ({
      ...slot,
      endTime: getPrivateBookingDisplayEndTime(slot.startTime, date, scenarioTiming, isCustomHoliday),
    }),
    [scenarioTiming, isCustomHoliday]
  )
  
  // グループID（既存または送信時に作成）
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(groupId || null)
  // 作成されたグループの招待コード
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  
  // 編集可能な候補日時
  const [editableTimeSlots, setEditableTimeSlots] = useState(initialTimeSlots)

  // 親コンポーネントが非同期で selectedTimeSlots を更新した場合に同期
  // （PrivateBookingRequestPage 経由のフローで初回マウント時に空→非同期で充填されるケース）
  useEffect(() => {
    if (initialTimeSlots.length > 0) {
      setEditableTimeSlots(prev => prev.length === 0 ? initialTimeSlots : prev)
    }
  }, [initialTimeSlots])

  useEffect(() => {
    setEditableTimeSlots((prev) => prev.map((ts) => ({ ...ts, slot: enrichSlotEnd(ts.date, ts.slot) })))
  }, [enrichSlotEnd])
  const [showAddForm, setShowAddForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newSlotLabel, setNewSlotLabel] = useState('')

  // 表示する全有効店舗（オフィス除外）
  const displayStores = useMemo(() => {
    return stores.filter((s: any) => 
      s.ownership_type !== 'office' && s.status === 'active'
    )
  }, [stores])

  // シナリオ対応店舗IDセット（null = 全店舗対応）
  const scenarioAvailableSet = useMemo(() => {
    if (scenarioAvailableStores && scenarioAvailableStores.length > 0) {
      return new Set(scenarioAvailableStores)
    }
    return null
  }, [scenarioAvailableStores])

  // 希望店舗（前ページで選択済み、変更不可）
  const selectedStoreIds = useMemo(() => {
    const filtered = initialStoreIds.filter(id => {
      const isValid = displayStores.some((s: any) => s.id === id)
      const isAvailable = scenarioAvailableSet === null || scenarioAvailableSet.has(id)
      return isValid && isAvailable
    })
    return filtered.length > 0 ? filtered : []
  }, [initialStoreIds, displayStores, scenarioAvailableSet])

  // 追加可能な日付の範囲（今日から60日後まで）
  const dateRange = useMemo(() => {
    const fmtJst = (d: Date) =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d)
    const today = new Date()
    const minDate = fmtJst(today)
    const maxDate = fmtJst(new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000))
    return { minDate, maxDate }
  }, [])

  /** 候補追加・プルダウン用（HP貸切カレンダー・グループ候補追加と同じ営業時間マージ） */
  const storeIdsForSlotResolution = useMemo(() => {
    const eligible = displayStores.filter(
      (s: { id: string }) =>
        scenarioAvailableSet === null || scenarioAvailableSet.has(s.id)
    )
    if (selectedStoreIds.length > 0) return selectedStoreIds
    return eligible.map((s: { id: string }) => s.id)
  }, [displayStores, scenarioAvailableSet, selectedStoreIds])

  const storeIdsKey = storeIdsForSlotResolution.join(',')

  const { data: businessHoursData } = useQuery({
    queryKey: ['private-booking-request', 'business-hours', storeIdsKey],
    enabled: storeIdsForSlotResolution.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_hours_settings')
        .select('store_id, opening_hours, holidays, special_open_days, special_closed_days')
        .in('store_id', storeIdsForSlotResolution)
      if (error) { logger.error('貸切確認: 営業時間取得エラー', error); return new Map<string, BusinessHoursSettingRow>() }
      const map = new Map<string, BusinessHoursSettingRow>()
      for (const row of data || []) map.set(row.store_id as string, row as BusinessHoursSettingRow)
      return map
    },
  })
  const businessHoursByStore = businessHoursData ?? new Map<string, BusinessHoursSettingRow>()

  const { data: storeEvents = [], refetch: refetchStoreEvents } = useQuery({
    queryKey: ['private-booking-request', 'store-events', storeIdsKey],
    enabled: storeIdsForSlotResolution.length > 0,
    queryFn: async () => {
      const organizationId = await resolveOrgIdFromPageContext()
      if (!organizationId) return []
      const today = new Date()
      const windowEnd = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000)
      const { data, error } = await supabase
        .from('schedule_events_for_availability')
        .select('id, date, start_time, end_time, store_id, is_cancelled')
        .filter('organization_id', 'eq', organizationId)
        .in('store_id', storeIdsForSlotResolution)
        .gte('date', toJstYmd(today))
        .lte('date', toJstYmd(windowEnd))
        .eq('is_cancelled', false)
      if (error) { logger.error('貸切確認: イベント取得エラー', error); return [] }
      return data || []
    },
  })

  const {
    data: blockedSlotRows = [],
    refetch: refetchBlockedSlotRows,
  } = useQuery({
    queryKey: ['private-booking-request', 'blocked-slots', storeIdsKey],
    enabled: storeIdsForSlotResolution.length > 0,
    queryFn: async () => {
      const organizationId = await resolveOrgIdFromPageContext()
      if (!organizationId) return [] as PrivateBookingBlockedSlotRow[]
      const params: RpcGetPublicPrivateBookingAvailabilityParams = {
        p_organization_id: organizationId,
        p_store_ids: storeIdsForSlotResolution,
        p_start_date: dateRange.minDate,
        p_end_date: toJstYmd(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)),
      }
      const { data, error } = await supabase.rpc(
        'get_public_private_booking_availability',
        params
      )
      if (error) {
        logger.error('貸切確認: 募集停止枠取得エラー', error)
        throw error
      }
      return (data || []) as PrivateBookingBlockedSlotRow[]
    },
  })

  const getBlockedState = useCallback(
    (date: string, timeSlot: string, rows = blockedSlotRows) =>
      getPrivateBookingCandidateBlockedState(
        { date, timeSlot },
        storeIdsForSlotResolution,
        rows
      ),
    [blockedSlotRows, storeIdsForSlotResolution]
  )

  const pickerDate = newDate || dateRange.minDate
  const candidateSlotsForPicker = useMemo(() => {
    if (storeIdsForSlotResolution.length === 0) return []
    return computePrivateBookingSlots({
      date: pickerDate,
      storeIds: storeIdsForSlotResolution,
      businessHoursByStore,
      scenarioTiming,
      allStoreEvents: storeEvents,
      isCustomHoliday,
      privateBookingTimeSlots,
    })
  }, [
    pickerDate,
    storeIdsForSlotResolution,
    businessHoursByStore,
    scenarioTiming,
    storeEvents,
    isCustomHoliday,
  ])

  const handleAddTimeSlot = () => {
    if (!newDate || !newSlotLabel) return
    const daySlots = computePrivateBookingSlots({
      date: newDate,
      storeIds: storeIdsForSlotResolution,
      businessHoursByStore,
      scenarioTiming,
      allStoreEvents: storeEvents,
      isCustomHoliday,
      privateBookingTimeSlots,
    })
    const picked = daySlots.find((s) => s.label === newSlotLabel)
    if (!picked) {
      toast.error('この日・店舗の組み合わせでは、その時間帯を追加できません')
      return
    }
    if (getBlockedState(newDate, picked.label).allStoresBlocked) {
      toast.error(`${newDate} ${picked.label} は現在受付停止中です`)
      return
    }
    const slot: TimeSlot = {
      label: picked.label,
      startTime: picked.startTime,
      endTime: picked.endTime,
    }

    // 重複チェック
    const isDuplicate = editableTimeSlots.some(
      ts => ts.date === newDate && ts.slot.label === newSlotLabel
    )
    if (isDuplicate) return

    setEditableTimeSlots(prev => [...prev, { date: newDate, slot }])
    setNewDate('')
    setNewSlotLabel('')
    setShowAddForm(false)
  }

  const handleRemoveTimeSlot = (index: number) => {
    setEditableTimeSlots(prev => prev.filter((_, i) => i !== index))
  }
  
  // 予約サイトのベースパス
  const bookingBasePath = organizationSlug ? `/${organizationSlug}` : ''

  // フック
  const {
    customerName,
    setCustomerName,
    customerNickname,
    setCustomerNickname,
    customerEmail,
    setCustomerEmail,
    customerPhone,
    setCustomerPhone
  } = useCustomerData({ userId: user?.id, userEmail: user?.email })

  const {
    notes,
    setNotes,
    error,
    setError,
    validateForm
  } = usePrivateBookingForm()

  const { isSubmitting, success, handleSubmit } = usePrivateBookingSubmit({
    scenarioTitle,
    scenarioId,
    participationFee,
    maxParticipants,
    selectedTimeSlots: editableTimeSlots,
    selectedStoreIds,
    stores,
    userId: user?.id,
    groupId: createdGroupId || undefined
  })

  // 予約送信ハンドラ（グループも自動作成）
  const onSubmit = async () => {
    setError(null)
    
    if (editableTimeSlots.length === 0) {
      setError('候補日時を1件以上選択してください')
      return
    }

    if (selectedStoreIds.length === 0) {
      setError('希望店舗を1店舗以上選択してください')
      return
    }
    
    if (!validateForm(customerName, customerEmail, customerPhone)) {
      return
    }

    if (!user) {
      setError('ログインが必要です')
      return
    }

    try {
      // グループや顧客データを変更する前に、募集停止と公演競合を最新化して全候補を再検証する。
      const [latestBlockedResult, latestEventsResult] = await Promise.all([
        refetchBlockedSlotRows(),
        refetchStoreEvents(),
      ])
      if (latestBlockedResult.error) throw latestBlockedResult.error
      if (latestEventsResult.error) throw latestEventsResult.error
      const latestBlockedRows =
        (latestBlockedResult.data || []) as PrivateBookingBlockedSlotRow[]
      const latestEvents = latestEventsResult.data || []
      const invalidCandidates = editableTimeSlots.filter((candidate) => {
        const blockedState = getBlockedState(
          candidate.date,
          candidate.slot.label,
          latestBlockedRows
        )
        if (blockedState.allStoresBlocked) return true
        const latestSlots = computePrivateBookingSlots({
          date: candidate.date,
          storeIds: blockedState.availableStoreIds,
          businessHoursByStore,
          scenarioTiming,
          allStoreEvents: latestEvents,
          isCustomHoliday,
          privateBookingTimeSlots,
        })
        return !latestSlots.some((slot) => slot.label === candidate.slot.label)
      })
      if (invalidCandidates.length > 0) {
        const details = invalidCandidates
          .map((candidate) => `${candidate.date} ${candidate.slot.label}`)
          .join('、')
        setError(`${details} は現在受付停止中または既存公演と競合しています。候補日時を再選択してください。`)
        return
      }

      // グループがまだ作成されていない場合は作成
      let groupIdToUse = createdGroupId
      logger.log('[貸切リクエスト] 送信開始', { createdGroupId, scenarioId, editableTimeSlots: editableTimeSlots.length })
      
      if (!groupIdToUse && scenarioId) {
        logger.log('[貸切リクエスト] グループ作成開始')
        const group = await createGroup({
          scenarioId,
          name: undefined,
          preferredStoreIds: selectedStoreIds,
          candidateDates: editableTimeSlots.map((ts, idx) => ({
            date: ts.date,
            time_slot: ts.slot.label as '午前' | '午後' | '夜',
            start_time: ts.slot.startTime,
            end_time: ts.slot.endTime,
            order_num: idx + 1
          })),
          notes: notes || undefined,
        })
        logger.log('[貸切リクエスト] グループ作成成功', { groupId: group.id, inviteCode: group.invite_code })
        groupIdToUse = group.id
        setCreatedGroupId(group.id)
        setCreatedInviteCode(group.invite_code)
      } else {
        logger.log('[貸切リクエスト] グループ作成スキップ', { reason: groupIdToUse ? '既存グループあり' : 'scenarioIdなし' })
      }

      logger.log('[貸切リクエスト] handleSubmit呼び出し', { groupIdToUse })
      await handleSubmit(customerName, customerEmail, customerPhone, notes, customerNickname, groupIdToUse || undefined)
      
      // 成功後はボタンで遷移させるため自動リダイレクトは行わない
    } catch (error: any) {
      setError(error.message || '処理中にエラーが発生しました')
    }
  }

  // 成功画面
  if (success) {
    return (
      <div className="booking-shell min-h-screen bg-background overflow-x-clip">
        <Header />
        <NavigationBar currentPage={bookingBasePath} />
        
        <div className="container mx-auto max-w-3xl px-2 md:px-4 py-12">
          <Card className="border-2 border-purple-200 bg-purple-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-purple-600 mx-auto" />
              <h2 className="text-lg text-purple-800">貸切リクエストを受け付けました！</h2>
              <p className="text-sm text-purple-700 leading-relaxed">
                リクエストありがとうございます。<br />
                確認メールを {customerEmail} に送信しました。<br />
                担当者より折り返しご連絡させていただきます。
              </p>
              <div className="pt-4 flex flex-col gap-3">
                {createdInviteCode && (
                  <Button
                    onClick={() => navigate(`/group/invite/${createdInviteCode}`)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    グループを開く
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => navigate(bookingBasePath)}
                >
                  予約サイトトップに戻る
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const totalPrice = participationFee * maxParticipants
  const hasFullyBlockedCandidate = editableTimeSlots.some((candidate) =>
    getBlockedState(candidate.date, candidate.slot.label).allStoresBlocked
  )

  return (
    <div className="booking-shell min-h-screen bg-background overflow-x-clip">
      <Header />
      <NavigationBar currentPage={bookingBasePath} />

      {/* 戻るボタン */}
      <div className="bg-background border-b">
        <div className="container mx-auto max-w-5xl px-2 md:px-4 py-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center gap-1.5 hover:bg-accent h-8 px-2 text-sm">
            <ArrowLeft className="w-4 h-4" />
            シナリオ詳細に戻る
          </Button>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-2 md:px-4 py-6">
        <h1 className="text-xl font-bold mb-6">貸切リクエスト確認</h1>

        {error && (
          <Card className="mb-6 border-2 border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center gap-2 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左側：リクエスト内容 */}
          <div className="md:col-span-2 space-y-6">
            {/* シナリオ情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">シナリオ情報</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-base font-medium mb-2">{scenarioTitle}</h3>
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                      貸切予約
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>最大 {maxParticipants} 名まで</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 候補日時 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold">候補日時（{editableTimeSlots.length}/{MAX_TIME_SLOTS}件）</h2>
                {!showAddForm && editableTimeSlots.length < MAX_TIME_SLOTS && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(true)}
                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 h-8 px-2"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    追加
                  </Button>
                )}
              </div>
              
              {/* 追加フォーム */}
              {showAddForm && (
                <Card className="mb-3 border-purple-200 bg-purple-50">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm font-medium text-purple-800">候補日時を追加</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs mb-1 block">日付</Label>
                        <Input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          min={dateRange.minDate}
                          max={dateRange.maxDate}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">時間帯</Label>
                        <Select value={newSlotLabel} onValueChange={setNewSlotLabel}>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="選択..." />
                          </SelectTrigger>
                          <SelectContent>
                            {candidateSlotsForPicker.length === 0 ? (
                              <div className="px-2 py-3 text-xs text-muted-foreground">
                                日付を選ぶか、希望店舗の営業時間を読み込み中です
                              </div>
                            ) : (
                              candidateSlotsForPicker.map((slot) => {
                                const blockedState = getBlockedState(pickerDate, slot.label)
                                return (
                                  <SelectItem
                                    key={slot.label}
                                    value={slot.label}
                                    disabled={blockedState.allStoresBlocked}
                                  >
                                    {slot.label}（{slot.startTime}〜{slot.endTime}）
                                    {blockedState.allStoresBlocked
                                      ? ' — 現在受付停止中'
                                      : blockedState.partiallyBlocked
                                        ? ' — 一部店舗のみ受付中'
                                        : ''}
                                  </SelectItem>
                                )
                              })
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddForm(false)
                          setNewDate('')
                          setNewSlotLabel('')
                        }}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddTimeSlot}
                        disabled={!newDate || !newSlotLabel}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        追加する
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="space-y-2">
                {editableTimeSlots.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="p-4 text-center text-muted-foreground text-sm">
                      候補日時を追加してください
                    </CardContent>
                  </Card>
                ) : (
                  editableTimeSlots.map((slot, index) => {
                    const blockedState = getBlockedState(slot.date, slot.slot.label)
                    return (
                    <Card key={`${slot.date}-${slot.slot.label}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                              候補 {index + 1}
                            </Badge>
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span>{formatDate(slot.date)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{slot.slot.label} {slot.slot.startTime} - {slot.slot.endTime}</span>
                          </div>
                          {blockedState.allStoresBlocked && (
                            <p className="text-xs font-medium text-red-700">
                              現在受付停止中 — 候補日時を再選択してください
                            </p>
                          )}
                          {blockedState.partiallyBlocked && (
                            <p className="text-xs text-amber-700">
                              一部の希望店舗は現在受付停止中です
                            </p>
                          )}
                        </div>
                        {editableTimeSlots.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveTimeSlot(index)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 h-auto"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                    )
                  })
                )}
              </div>
            </div>

            {/* 希望店舗（前ページで選択済みの店舗を表示） */}
            <div>
              <h2 className="text-base font-semibold mb-3">希望店舗</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-2">
                    {displayStores
                      .filter((store: any) => selectedStoreIds.includes(store.id))
                      .map((store: any) => (
                        <div
                          key={store.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-purple-300 bg-purple-50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="text-sm font-medium">{store.name}</span>
                            </div>
                            {store.address && (
                              <p className="text-xs mt-0.5 ml-5.5 text-muted-foreground">{store.address}</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                  {selectedStoreIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      ※ 最終的な開催店舗は、候補日時と合わせて店舗側が決定します
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* お客様情報 */}
            <div>
              <h2 className="text-base font-semibold mb-3">お客様情報</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">お名前 *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">ニックネーム</Label>
                    <Input
                      value={customerNickname}
                      onChange={(e) => setCustomerNickname(e.target.value)}
                      placeholder="タロウ"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">店舗で呼ばれる際のお名前（任意）</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">メールアドレス *</Label>
                    <Input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="example@example.com"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">電話番号 *</Label>
                    <Input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="090-1234-5678"
                      required
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-1.5 block">備考</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="伝達事項があればご記入ください。"
                      rows={4}
                      className="text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 右側：料金サマリー */}
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold mb-3">料金</h2>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">参加費（1名）</span>
                    <span>¥{participationFee.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">人数</span>
                    <span>{maxParticipants}名</span>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold">合計</span>
                      <span className="text-lg text-purple-600 font-bold">¥{totalPrice.toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      ※ 実際の料金は店舗との調整により変動する場合があります
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 注意事項（DBから取得） */}
            <BookingNotice
              mode="private"
              storeId={selectedStoreIds.length === 1 ? selectedStoreIds[0] : null}
            />

            <Button
              onClick={onSubmit}
              disabled={isSubmitting || groupLoading || hasFullyBlockedCandidate}
              className="w-full h-10 text-base bg-purple-600 hover:bg-purple-700"
            >
              {(isSubmitting || groupLoading) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {groupLoading ? 'グループ作成中...' : 'リクエスト送信中...'}
                </>
              ) : hasFullyBlockedCandidate ? '受付停止中の候補を再選択してください' : '貸切リクエストを送信'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
