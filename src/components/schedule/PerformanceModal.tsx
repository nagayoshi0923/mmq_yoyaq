import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScenarioEditDialogV2 } from '@/components/modals/ScenarioEditDialogV2'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { staffApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Staff as StaffType, Scenario, Store } from '@/types'
import { CATEGORY_TONE } from './performanceModal/constants'
import { useScenarioOptions } from './performanceModal/useScenarioOptions'
import { useKitStoreIds } from './performanceModal/useKitStoreIds'
import { usePerformanceForm } from './performanceModal/usePerformanceForm'
import { PerformanceSummary } from './performanceModal/PerformanceSummary'
import { DateTimeVenueSection } from './performanceModal/sections/DateTimeVenueSection'
import { PerformanceContentSection } from './performanceModal/sections/PerformanceContentSection'
import { CategorySelectSection } from './performanceModal/sections/CategorySelectSection'
import { StaffNotesSection } from './performanceModal/sections/StaffNotesSection'
import { ScenarioChangeConfirmDialog } from './performanceModal/dialogs/ScenarioChangeConfirmDialog'
import { DeleteEventConfirmDialog } from './performanceModal/dialogs/DeleteEventConfirmDialog'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { toast } from 'sonner'
import { ReservationList } from './modal/ReservationList'
import { EventHistoryTab } from './modal/EventHistoryTab'
import { SurveyResponsesTab } from './modal/SurveyResponsesTab'
import { clearEmptySlotMemo } from './SlotMemoInput'
import { useTimeSlotSettings } from '@/hooks/useTimeSlotSettings'
import { useOrganization } from '@/hooks/useOrganization'
import { timeSlotEnToSchedule } from '@/lib/timeSlot'
import { getCurrentOrganizationId } from '@/lib/organization'

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => Promise<boolean>
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, time_slot: string, suggestedStartTime?: string }  // 追加時のみ（DBカラム名に統一）
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  events?: ScheduleEvent[]  // 同じ日の他の公演（準備時間考慮のため）
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
  allAvailableStaff?: StaffType[]  // その日時に出勤している全GM
  onScenariosUpdate?: () => void  // シナリオ作成後の更新用コールバック
  onStaffUpdate?: () => void  // スタッフ作成後の更新用コールバック
  onParticipantChange?: (eventId: string, newCount: number) => void  // 参加者数変更時のコールバック
  onDeleteEvent?: (event: ScheduleEvent) => Promise<void>  // イベント削除時のコールバック（貸切参加者全員キャンセル時）
  /** 履歴スナップショット表示用: 全フィールド disabled・保存/削除非表示・他タブ非表示にして「その時点の見た目」だけを再現する */
  readOnly?: boolean
}

export function PerformanceModal({
  isOpen,
  onClose,
  onSave,
  mode,
  event,
  initialData,
  stores,
  scenarios,
  staff,
  events = [],
  availableStaffByScenario = {},
  allAvailableStaff = [],
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange,
  onDeleteEvent,
  readOnly = false
}: PerformanceModalProps) {
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  // タブの状態管理（再レンダリング時にリセットされないように）
  const [activeTab, setActiveTab] = useState<string>('edit')
  // 予約データから取得したスタッフ参加者（DBをシングルソースとする）
  const [staffParticipantsFromDB, setStaffParticipantsFromDB] = useState<string[]>([])
  // add モードで「+ 参加者を追加」した時のバッファ (event 未保存のため DB INSERT できないので一時保持)
  // 保存時に handleSave で一括 INSERT する
  type PendingParticipant = { name: string; count: number; paymentMethod: 'onsite' | 'online' | 'staff' }
  const [pendingParticipants, setPendingParticipants] = useState<PendingParticipant[]>([])
  // シナリオ変更確認ダイアログ（参加者がいる場合）
  const [pendingScenarioTitle, setPendingScenarioTitle] = useState<string | null>(null)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  // ローカルで参加者数を管理（リアルタイム表示用）
  const [localCurrentParticipants, setLocalCurrentParticipants] = useState<number>(event?.current_participants || 0)

  // 組織の時間帯設定を取得（平日/休日を考慮）
  const { getDefaultsForDate, isLoading: isTimeSlotSettingsLoading } = useTimeSlotSettings()
  
  // 組織IDを取得（履歴表示用）
  const { organizationId } = useOrganization()

  // フォーム状態（formData/timeSlot/各ハンドラ）は usePerformanceForm フックへ集約
  const {
    formData,
    setFormData,
    timeSlot,
    timeSlotDefaults,
    handleTimeSlotChange,
    handleStartTimeChange,
    applyScenarioChange,
    getTimeSlotLabel,
  } = usePerformanceForm({
    mode,
    event,
    initialData,
    stores,
    scenarios,
    getDefaultsForDate,
    isTimeSlotSettingsLoading,
    setLocalCurrentParticipants,
  })



  // シナリオ選択用オプション（派生memo は useScenarioOptions フックへ抽出）
  const scenarioOptions = useScenarioOptions(scenarios, formData.venue, staff, allAvailableStaff)

  /** アンケートタブ用 scenario_master_id（レンダー内 IIFE + logger だと毎回ログが爆発するため useMemo） */
  const surveyTabScenarioId = useMemo(() => {
    const selectedScenario = scenarios.find(s => s.title === event?.scenario)
    return selectedScenario?.scenario_master_id || selectedScenario?.id || undefined
  }, [scenarios, event?.scenario])


  // 選択中シナリオのキット配置店舗一覧（scenario_master_id 単位）
  const kitStoreIds = useKitStoreIds(formData.scenario, scenarios)


  const handleSave = async () => {
    // 時間帯を'朝'/'昼'/'夜'形式で保存
    // gmRoles (camelCase) を gm_roles (snake_case) に変換してAPIに渡す
    // スタッフ参加/見学もGMリストに保持する（除外しない）
    
    let scenario = formData.scenario || ''
    let notes = formData.notes || ''
    
    // 場所貸しの場合、シナリオ欄の内容を備考に移動
    const isVenueRental = formData.category === 'venue_rental' || formData.category === 'venue_rental_free'
    if (isVenueRental && scenario) {
      // 備考に既存の内容があれば改行して追加、なければそのまま設定
      notes = notes ? `${scenario}\n${notes}` : scenario
      scenario = '' // シナリオ欄はクリア
    }
    
    // 場所貸しの公演料金（未設定の場合はデフォルト12,000円）
    const venueRentalFee = isVenueRental 
      ? (formData.venue_rental_fee ?? 12000) 
      : undefined
    
    const saveData = {
      ...formData,
      scenario,
      scenario_master_id: isVenueRental ? undefined : formData.scenario_master_id, // 場所貸しはシナリオIDもクリア
      notes,
      venue_rental_fee: venueRentalFee,
      gms: formData.gms,
      time_slot: getTimeSlotLabel(timeSlot),
      gm_roles: formData.gmRoles || {},
      reservation_name: formData.reservation_name || '', // 予約者名
      is_private_request: formData.is_private_request, // 貸切リクエストフラグを明示的に含める
      reservation_id: formData.reservation_id // 予約IDを明示的に含める
    }
    logger.log('🔍 保存データ:', JSON.stringify({ 
      is_private_request: saveData.is_private_request,
      reservation_id: saveData.reservation_id,
      reservation_name: saveData.reservation_name,
      id: saveData.id
    }))
    
    // 追加モードの場合、スロットメモをクリア（備考に引き継いだので不要）
    if (mode === 'add' && initialData) {
      void clearEmptySlotMemo(initialData.date, initialData.venue, timeSlot)
    }
    
    // 楽観的クローズ: onSave の完了を待たずにダイアログを閉じて体感速度を上げる。
    // 重複/通信エラー時は useEventOperations 側で toast 表示されるので、ユーザは
    // toast を見て必要に応じてモーダルを開き直す。
    // 保存中の体感フィードバックとして loading toast を出し、完了で dismiss する。
    const loadingToastId = toast.loading('保存中...')
    const savePromise = onSave(saveData)
    onClose()

    // 残りの post-save 処理 (pending 参加者 INSERT) はバックグラウンドで実行
    void (async () => {
      const success = await savePromise
      toast.dismiss(loadingToastId)
      if (!success) return // error toast は useEventOperations 側で出る

      // バッファされた一般参加者 (+ 参加者を追加で追加された分) を並列 INSERT
      try {
        if (pendingParticipants.length > 0) {
          const orgId = await getCurrentOrganizationId()
          let targetEventId: string | undefined = event?.id
          if (!targetEventId) {
            const { data: matched } = await supabase
              .from('schedule_events')
              .select('id')
              .eq('organization_id', orgId)
              .eq('date', saveData.date)
              .eq('start_time', saveData.start_time)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (matched) targetEventId = matched.id
          }
          if (targetEventId) {
            const scenarioObj = scenarios.find(s => s.title === saveData.scenario)
            const storeId = event?.store_id ?? (stores.find(s => s.id === saveData.venue || s.name === saveData.venue)?.id ?? null)
            const isGmTest = saveData.category === 'gmtest'
            const baseFee = isGmTest
              ? (scenarioObj?.gm_test_participation_fee ?? scenarioObj?.participation_fee ?? 0)
              : (scenarioObj?.participation_fee ?? 0)
            await Promise.all(pendingParticipants.map((p) => {
              const isStaffPay = p.paymentMethod === 'staff'
              const unitPrice = isStaffPay ? 0 : baseFee
              const total = unitPrice * p.count
              const now = new Date()
              const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '')
              const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase()
              const reservationNumber = `${dateStr}-${randomStr}`
              return supabase.from('reservations').insert({
                reservation_number: reservationNumber,
                schedule_event_id: targetEventId,
                organization_id: orgId,
                title: saveData.scenario || '',
                scenario_master_id: scenarioObj?.id ?? null,
                store_id: storeId,
                customer_name: p.name,
                participant_names: [p.name],
                participant_count: p.count,
                base_price: unitPrice * p.count,
                unit_price: unitPrice,
                total_price: total,
                final_price: total,
                discount_amount: 0,
                duration: 240,
                requested_datetime: new Date().toISOString(),
                payment_method: p.paymentMethod,
                payment_status: (p.paymentMethod === 'online' || isStaffPay) ? 'paid' : 'pending',
                status: 'confirmed',
                reservation_source: isStaffPay ? 'staff_participation' : 'walk_in',
              })
            }))
            setPendingParticipants([])
          }
        }
      } catch (err) {
        logger.error('保存後の参加者バッファ同期に失敗:', err)
      }
    })()
  }

  const handleScenarioSaved = async () => {
    // シナリオリストを更新（ダイアログは開いたままなので editingScenarioId はリセットしない）
    // editingScenarioId のリセットは onClose 時に行う
    if (onScenariosUpdate) {
      await onScenariosUpdate()
    }
  }

  const handleCreateStaff = async (newStaff: StaffType) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      // StaffTypeにはcreated_at/updated_atがないが、フォームから渡される可能性があるため除外
      const staffWithTimestamps = newStaff as StaffType & { id?: string; created_at?: string; updated_at?: string }
      const { id, created_at, updated_at, ...staffForDB } = staffWithTimestamps
      
      logger.log('スタッフ作成リクエスト:', staffForDB)
      const createdStaff = await staffApi.create(staffForDB)
      logger.log('スタッフ作成成功:', createdStaff)
      
      setIsStaffModalOpen(false)
      
      // 親コンポーネントにスタッフリストの更新を通知
      if (onStaffUpdate) {
        await onStaffUpdate()
      }
      
      // 新しく作成したスタッフをGMとして選択
      setFormData((prev: EventFormData) => ({ 
        ...prev, 
        gms: [...prev.gms, newStaff.name],
        gmRoles: { ...prev.gmRoles, [newStaff.name]: 'main' }
      }))
    } catch (error: unknown) {
      logger.error('スタッフ作成エラー:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      showToast.error('スタッフの作成に失敗しました', message)
    }
  }


  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        setActiveTab('edit') // タブをリセット
        onClose()
      }
    }}>
      <DialogContent
        size="md"
        data-perf-modal=""
        className="h-[85vh] sm:h-[80vh] max-w-[480px] overflow-hidden flex flex-col p-0 gap-0 transition-colors"
        // 編集中のカテゴリ把握用に、ダイアログ全体の背景・枠を該当カテゴリ色で着色
        style={(() => {
          const tone = CATEGORY_TONE[formData.category]
          return tone
            ? ({ backgroundColor: tone.bg, borderColor: tone.border, ['--input-bg' as string]: tone.bg } as React.CSSProperties)
            : undefined
        })()}
        // 保存後、events 再フェッチでトリガー要素が一時的に消えると Radix の focus
        // 復元先がなくなり body にフォールバックしてページ最上部までスクロールするため、
        // close 時の auto-focus 復元を無効化する。
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* カテゴリ別 tone.bg を Select/Input/Textarea/PopoverTrigger/タブ/白系ボタン に適用 */}
        {CATEGORY_TONE[formData.category] && (
          <style>{`
            [data-perf-modal] [role="combobox"],
            [data-perf-modal] button[aria-haspopup="dialog"],
            [data-perf-modal] input:not([type="checkbox"]):not([type="radio"]),
            [data-perf-modal] textarea,
            [data-perf-modal] button.bg-white,
            [data-perf-modal] button.bg-background {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
              border-color: ${CATEGORY_TONE[formData.category].border} !important;
            }
            [data-perf-modal] [role="combobox"]:focus,
            [data-perf-modal] input:not([type="checkbox"]):not([type="radio"]):focus,
            [data-perf-modal] textarea:focus {
              background-color: #ffffff !important;
            }
            /* アクティブタブの白背景を tone.bg に上書き (shadcn デフォルトは bg-background) */
            [data-perf-modal] [role="tab"][data-state="active"] {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
            }
            /* outline 系の Button (キャンセル等) も tone.bg に */
            [data-perf-modal] button[class*="border-input"]:not([data-state="active"]):not(.bg-slate-900):not(.bg-primary) {
              background-color: ${CATEGORY_TONE[formData.category].bg} !important;
              border-color: ${CATEGORY_TONE[formData.category].border} !important;
            }
            /* Badge 系 (bg-gray-100 等) は tone.section で内側に少し色がつくように */
            [data-perf-modal] .bg-gray-100 {
              background-color: ${CATEGORY_TONE[formData.category].section} !important;
            }
          `}</style>
        )}
        <DialogHeader className="px-2 sm:px-4 py-1.5 sm:py-2 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6 sm:pr-8">
            <div className="flex flex-col min-w-0 shrink-0">
              <DialogTitle className="text-sm sm:text-base">{modalTitle}</DialogTitle>
              <DialogDescription className="text-[11px] sm:text-xs">
                {modalDescription}
              </DialogDescription>
            </div>
            {/* 公演情報サマリー (右上、旧フッターから移動) */}
            <div className="ml-auto">
              <PerformanceSummary
                formData={formData}
                scenarios={scenarios}
                staffParticipantsFromDB={staffParticipantsFromDB}
                mode={mode}
                event={event}
                localCurrentParticipants={localCurrentParticipants}
              />
            </div>
          </div>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden min-h-0">
          <div className={`px-2 sm:px-4 pt-1.5 sm:pt-2 shrink-0 ${readOnly ? 'hidden' : ''}`}>
            <TabsList
              className="grid w-full grid-cols-4 h-7 sm:h-8"
              style={CATEGORY_TONE[formData.category] ? { backgroundColor: CATEGORY_TONE[formData.category].section } : undefined}
            >
              <TabsTrigger value="edit" className="text-[11px] sm:text-xs h-6 sm:h-7">公演情報</TabsTrigger>
              <TabsTrigger value="reservations" className="text-[11px] sm:text-xs h-6 sm:h-7">
                予約者
                {event && (
                  <Badge variant="secondary" className="ml-1 h-3.5 sm:h-4 px-1 text-[11px] sm:text-[11px]">
                    {event.is_private_request || event.is_private_booking
                      ? '満席'
                      : `${localCurrentParticipants}/${event.scenarios?.player_count_max || event.max_participants || 8}名`
                    }
                    {event.is_cancelled && (event.current_participants ?? 0) > 0 && (
                      <span className="text-red-500 ml-1">
                        （中止前{event.current_participants}名）
                      </span>
                    )}
                    {!event.is_cancelled && staffParticipantsFromDB.length > 0 && (
                      <span className="text-blue-600 ml-1">
                        （内スタッフ{staffParticipantsFromDB.length}）
                      </span>
                    )}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="survey" className="text-[11px] sm:text-xs h-6 sm:h-7">アンケート</TabsTrigger>
              <TabsTrigger value="history" className="text-[11px] sm:text-xs h-6 sm:h-7">更新履歴</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <fieldset disabled={readOnly} className="min-w-0 p-0 m-0 border-0" style={readOnly ? { display: 'contents' } : undefined}>
            <div className="space-y-3 pb-2 sm:pb-0">

          {/* ── カテゴリ（クイック選択） ── */}
          <CategorySelectSection formData={formData} setFormData={setFormData} />

          {/* ── セクション1: 日時・場所 ── */}
          <DateTimeVenueSection
            formData={formData}
            setFormData={setFormData}
            stores={stores}
            timeSlot={timeSlot}
            handleTimeSlotChange={handleTimeSlotChange}
            timeSlotDefaults={timeSlotDefaults}
            handleStartTimeChange={handleStartTimeChange}
          />

          {/* ── セクション2: 公演内容 ── */}
          <PerformanceContentSection
            formData={formData}
            setFormData={setFormData}
            mode={mode}
            scenarios={scenarios}
            stores={stores}
            scenarioOptions={scenarioOptions}
            kitStoreIds={kitStoreIds}
            localCurrentParticipants={localCurrentParticipants}
            setPendingScenarioTitle={setPendingScenarioTitle}
            applyScenarioChange={applyScenarioChange}
            setIsScenarioDialogOpen={setIsScenarioDialogOpen}
            setEditingScenarioId={setEditingScenarioId}
          />

          {/* ── セクション3: スタッフ・備考 ── */}
          <StaffNotesSection
            formData={formData}
            setFormData={setFormData}
            mode={mode}
            event={event}
            staff={staff}
            scenarios={scenarios}
            allAvailableStaff={allAvailableStaff}
            staffParticipantsFromDB={staffParticipantsFromDB}
            setStaffParticipantsFromDB={setStaffParticipantsFromDB}
            setIsStaffModalOpen={setIsStaffModalOpen}
          />
        </div>

          {/* アクションボタン削除 */}
            </fieldset>
          </TabsContent>
          
          <TabsContent value="reservations" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <ReservationList
              event={event || null}
              currentEventData={formData}
              mode={mode}
              stores={stores}
              scenarios={scenarios}
              staff={staff}
              onLocalParticipantUpdate={(count) => {
                setLocalCurrentParticipants(count)
              }}
              onParticipantChange={(eventId, newCount) => {
                setLocalCurrentParticipants(newCount)
                onParticipantChange?.(eventId, newCount)
              }}
              onGmsChange={(gms, gmRoles) => setFormData(prev => ({ ...prev, gms, gmRoles }))}
              onStaffParticipantsChange={setStaffParticipantsFromDB}
              pendingParticipants={pendingParticipants}
              onPendingAdd={(p) => setPendingParticipants(prev => [...prev, p])}
              onPendingRemove={(idx) => setPendingParticipants(prev => prev.filter((_, i) => i !== idx))}
              // GM タブで「スタッフ参加」役割を付けたが、まだ DB 予約として未登録の名前
              pendingStaffGmNames={(formData.gms || []).filter(n => (formData.gmRoles?.[n] === 'staff') && !staffParticipantsFromDB.includes(n))}
              onPendingStaffGmRemove={(name) => {
                // 予約者タブから消すと、GM 側からも完全削除 (gms と gmRoles の両方)
                setFormData((prev: EventFormData) => {
                  const newGms = (prev.gms || []).filter(g => g !== name)
                  const newRoles = { ...prev.gmRoles }
                  delete newRoles[name]
                  return { ...prev, gms: newGms, gmRoles: newRoles }
                })
              }}
              onDeleteEvent={event && onDeleteEvent ? async () => {
                await onDeleteEvent(event)
                onClose()
              } : undefined}
            />
          </TabsContent>

          <TabsContent value="survey" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <SurveyResponsesTab
              reservationId={event?.reservation_id}
              scenarioId={surveyTabScenarioId}
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 mt-0 min-h-0">
            <EventHistoryTab
              cellInfo={formData.date && formData.venue ? {
                date: formData.date,
                storeId: event?.store_id || formData.venue,
                timeSlot: formData.time_slot || timeSlotEnToSchedule(timeSlot)
              } : undefined}
              organizationId={organizationId || undefined}
              stores={stores}
              scenarios={scenarios}
              staff={staff}
            />
          </TabsContent>
        </Tabs>

        {/* フッターアクションボタン */}
        <div
          className="flex items-center justify-end gap-1.5 p-1.5 sm:p-2 border-t shrink-0"
          style={CATEGORY_TONE[formData.category]
            ? { backgroundColor: CATEGORY_TONE[formData.category].bg, borderTopColor: CATEGORY_TONE[formData.category].border }
            : undefined}
        >
          <div className="flex gap-1.5 shrink-0 w-full sm:w-auto justify-end">
            {!readOnly && mode === 'edit' && onDeleteEvent && (
              <Button
                variant="outline"
                onClick={() => setDeleteConfirming(true)}
                className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground mr-auto"
              >
                この予定を削除
              </Button>
            )}
            <Button variant="outline" onClick={onClose} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
              {readOnly ? '閉じる' : 'キャンセル'}
            </Button>
            {!readOnly && (
              <Button onClick={handleSave} className="min-w-[60px] sm:min-w-[80px] text-[11px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
                {mode === 'add' ? '追加' : '保存'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* シナリオ変更確認ダイアログ（参加者がいる場合） */}
      <ScenarioChangeConfirmDialog
        pendingScenarioTitle={pendingScenarioTitle}
        setPendingScenarioTitle={setPendingScenarioTitle}
        localCurrentParticipants={localCurrentParticipants}
        applyScenarioChange={applyScenarioChange}
      />

      {/* 公演削除確認ダイアログ */}
      <DeleteEventConfirmDialog
        deleteConfirming={deleteConfirming}
        setDeleteConfirming={setDeleteConfirming}
        event={event}
        onDeleteEvent={onDeleteEvent}
        onClose={onClose}
      />

      {/* シナリオ編集ダイアログ（V2: タブ形式の新しいUI） */}
      <ScenarioEditDialogV2
        isOpen={isScenarioDialogOpen}
        onClose={() => {
          setIsScenarioDialogOpen(false)
          setEditingScenarioId(null)
        }}
        scenarioId={editingScenarioId}
        onSaved={handleScenarioSaved}
      />

      {/* スタッフ(GM)作成モーダル */}
      <StaffEditModal
        staff={null}
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onSave={handleCreateStaff}
        stores={stores}
        scenarios={scenarios}
      />
    </Dialog>
  )
}
