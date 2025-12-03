import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { SingleDatePopover } from '@/components/ui/single-date-popover'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { X, ExternalLink, UserCog } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ScenarioEditDialog } from '@/components/modals/ScenarioEditDialog'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { staffApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import { cn } from '@/lib/utils'
import type { Staff as StaffType, Scenario, Store } from '@/types'
import { ScheduleEvent, EventFormData } from '@/types/schedule'
import { logger } from '@/utils/logger'
import { ReservationList } from './modal/ReservationList'

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: EventFormData) => void
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, timeSlot: string }  // 追加時のみ
  stores: Store[]
  scenarios: Scenario[]
  staff: StaffType[]
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
  allAvailableStaff?: StaffType[]  // その日時に出勤している全GM
  onScenariosUpdate?: () => void  // シナリオ作成後の更新用コールバック
  onStaffUpdate?: () => void  // スタッフ作成後の更新用コールバック
  onParticipantChange?: (eventId: string, newCount: number) => void  // 参加者数変更時のコールバック
}

// 30分間隔の時間オプションを生成
const generateTimeOptions = () => {
  const options = []
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      options.push(timeString)
    }
  }
  return options
}

const timeOptions = generateTimeOptions()

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
  availableStaffByScenario = {},
  allAvailableStaff = [],
  onScenariosUpdate,
  onStaffUpdate,
  onParticipantChange
}: PerformanceModalProps) {
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [formData, setFormData] = useState<EventFormData>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    gmRoles: {}, // 初期値
    start_time: '10:00',
    end_time: '14:00',
    category: 'private',
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    capacity: 0,
    notes: ''
  })

  // 時間帯のデフォルト設定（設定から動的に取得）
  const [timeSlotDefaults, setTimeSlotDefaults] = useState({
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  })

  // 時間帯が変更されたときに開始・終了時間を自動設定
  const handleTimeSlotChange = (slot: 'morning' | 'afternoon' | 'evening') => {
    setTimeSlot(slot)
    const defaults = timeSlotDefaults[slot]
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: defaults.start_time,
      end_time: defaults.end_time
    }))
  }

  // 公演スケジュール設定と営業時間設定を読み込む
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storeId = formData.venue || stores[0]?.id
        if (!storeId) return

        // 公演スケジュール設定を取得
        const { data: performanceData, error: performanceError } = await supabase
          .from('performance_schedule_settings')
          .select('performance_times, default_duration')
          .eq('store_id', storeId)
          .maybeSingle()

        if (performanceError && performanceError.code !== 'PGRST116') {
          logger.error('公演スケジュール設定取得エラー:', performanceError)
        }

        // 営業時間設定を取得
        const { data: businessHoursData, error: businessHoursError } = await supabase
          .from('business_hours_settings')
          .select('opening_hours, holidays, time_restrictions')
          .eq('store_id', storeId)
          .maybeSingle()

        if (businessHoursError && businessHoursError.code !== 'PGRST116') {
          logger.error('営業時間設定取得エラー:', businessHoursError)
        }

        // 公演スケジュール設定の適用
        if (performanceData?.performance_times) {
          const newDefaults = {
            morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
            afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
            evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
          }

          // 設定された時間に基づいて更新
          performanceData.performance_times.forEach((time: any, index: number) => {
            const slotKey = time.slot as keyof typeof newDefaults
            if (slotKey && newDefaults[slotKey]) {
              const duration = performanceData.default_duration || 240 // デフォルト4時間
              const startTime = time.start_time
              const endTime = new Date(`2000-01-01T${startTime}`)
              endTime.setMinutes(endTime.getMinutes() + duration)
              const endTimeStr = endTime.toTimeString().slice(0, 5)
              
              newDefaults[slotKey] = {
                start_time: startTime,
                end_time: endTimeStr,
                label: newDefaults[slotKey].label
              }
            }
          })

          setTimeSlotDefaults(newDefaults)
        }

        // 営業時間制限の適用（時間選択肢の制限）
        if (businessHoursData?.opening_hours) {
          // TODO: 営業時間制限を時間選択肢に適用
          logger.log('営業時間設定を読み込みました:', businessHoursData)
        }

      } catch (error) {
        logger.error('設定読み込みエラー:', error)
      }
    }

    if (formData.venue || stores.length > 0) {
      loadSettings()
    }
  }, [formData.venue, stores])

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      // シナリオIDがない場合は、タイトルから逆引き
      const selectedScenario = scenarios.find(s => s.title === event.scenario)
      
      // time_slotが存在する場合はそれを使用、なければstart_timeから判定
      let slot: 'morning' | 'afternoon' | 'evening' = 'morning'
      if (event.timeSlot) {
        // timeSlotが'朝'/'昼'/'夜'形式の場合
        if (event.timeSlot === '朝') slot = 'morning'
        else if (event.timeSlot === '昼') slot = 'afternoon'
        else if (event.timeSlot === '夜') slot = 'evening'
      } else {
        // start_timeから判定（フォールバック）
        const startHour = parseInt(event.start_time.split(':')[0])
        if (startHour < 12) {
          slot = 'morning'
        } else if (startHour < 17) {
          slot = 'afternoon'
        } else {
          slot = 'evening'
        }
      }
      setTimeSlot(slot)
      
      setFormData({
        ...event,
        scenario_id: selectedScenario?.id,  // IDを設定
        time_slot: event.timeSlot || (slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'), // time_slotを設定
        max_participants: selectedScenario?.player_count_max ?? event.max_participants ?? DEFAULT_MAX_PARTICIPANTS, // シナリオの参加人数を反映
        gmRoles: event.gm_roles || {}, // 既存の役割があれば設定
        capacity: event.max_participants || 0 // capacityを追加
      })
    } else if (mode === 'add' && initialData) {
      // 追加モード：初期データで初期化
      const slot = initialData.timeSlot as 'morning' | 'afternoon' | 'evening'
      setTimeSlot(slot)
      
      const defaults = timeSlotDefaults[slot] || timeSlotDefaults.morning
      
      setFormData({
        id: Date.now().toString(),
        date: initialData.date,
        venue: initialData.venue,
        scenario: '',
        gms: [],
        gmRoles: {},
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        category: 'private',
        max_participants: DEFAULT_MAX_PARTICIPANTS,
        capacity: 0,
        notes: ''
      })
    }
  }, [mode, event, initialData])

  // 終了時間を自動計算する関数
  const calculateEndTime = (startTime: string, scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    if (!selectedScenario) return startTime
    
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = startMinutes + selectedScenario.duration
    const endHour = Math.floor(endMinutes / 60)
    const endMinute = endMinutes % 60
    return `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
  }

  // 開始時間変更時の自動設定
  const handleStartTimeChange = (startTime: string) => {
    const endTime = formData.scenario ? calculateEndTime(startTime, formData.scenario) : startTime
    
    setFormData((prev: EventFormData) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime
    }))
  }

  // 時間帯（morning/afternoon/evening）を'朝'/'昼'/'夜'にマッピング
  const getTimeSlotLabel = (slot: 'morning' | 'afternoon' | 'evening'): string => {
    return slot === 'morning' ? '朝' : slot === 'afternoon' ? '昼' : '夜'
  }

  const handleSave = () => {
    // 時間帯を'朝'/'昼'/'夜'形式で保存
    // gmRoles (camelCase) を gm_roles (snake_case) に変換してAPIに渡す
    const saveData = {
      ...formData,
      time_slot: getTimeSlotLabel(timeSlot),
      gm_roles: formData.gmRoles
    }
    onSave(saveData)
    onClose()
  }

  const handleScenarioSaved = async () => {
    // シナリオリストを更新
    if (onScenariosUpdate) {
      await onScenariosUpdate()
    }
    // 編集中のシナリオIDをリセット
    setEditingScenarioId(null)
  }

  const handleCreateStaff = async (newStaff: StaffType) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      const { id, created_at, updated_at, ...staffForDB } = newStaff as any
      
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
      alert(`スタッフの作成に失敗しました: ${message}`)
    }
  }

  // 店舗名を取得
  const getStoreName = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    return store ? store.name : storeId
  }

  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" className="max-h-[85vh] sm:max-h-[80vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">公演情報</TabsTrigger>
              <TabsTrigger value="reservations">
                予約者
                {event && typeof event.participant_count === 'number' && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {event.participant_count}名
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="edit" className="flex-1 overflow-y-auto p-6 mt-0">
            <div className="space-y-4 pb-20 sm:pb-0">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">日付</Label>
              <SingleDatePopover
                date={formData.date}
                onDateChange={(date) => {
                  setFormData((prev: any) => ({ ...prev, date: date || '' }))
                }}
                placeholder="日付を選択してください"
              />
            </div>
            <div>
              <Label htmlFor="venue">店舗</Label>
              <Select 
                value={formData.venue} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="店舗を選択">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal" variant="secondary">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal" variant="secondary">
                          {store.name}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
            <SearchableSelect
              value={formData.scenario}
              onValueChange={(scenarioTitle) => {
                const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
                
                if (selectedScenario) {
                  const endTime = calculateEndTime(formData.start_time, scenarioTitle)
                  
                  setFormData((prev: EventFormData) => ({
                    ...prev,
                    scenario: scenarioTitle,
                    scenario_id: selectedScenario.id,  // IDも同時に設定
                    end_time: endTime,
                    max_participants: selectedScenario.player_count_max
                  }))
                } else {
                  setFormData((prev: EventFormData) => ({
                    ...prev,
                    scenario: scenarioTitle
                  }))
                }
              }}
              options={scenarios.map(scenario => {
                // このシナリオで出勤可能なGMを取得
                const scenarioAvailableGMs = allAvailableStaff.filter(gm => {
                  const specialScenarios = gm.special_scenarios || []
                  return specialScenarios.includes(scenario.id) || specialScenarios.includes(scenario.title)
                })
                
                return {
                  value: scenario.title,
                  label: scenario.title,
                  displayInfo: scenarioAvailableGMs.length > 0 
                    ? scenarioAvailableGMs.map(gm => gm.name).join(', ')
                    : undefined
                }
              })}
              placeholder="シナリオを選択"
              searchPlaceholder="シナリオ名で検索..."
              emptyText="シナリオが見つかりません"
              emptyActionLabel="シナリオを作成"
              onEmptyAction={() => setIsScenarioDialogOpen(true)}
            />
            {formData.is_private_request && (
              <p className="text-xs text-purple-600 mt-1">
                ※ 貸切リクエストのシナリオは変更できません
              </p>
            )}
            {/* シナリオ編集へのリンク */}
            {formData.scenario && (() => {
              const selectedScenario = scenarios.find(s => s.title === formData.scenario)
              if (selectedScenario) {
                return (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => {
                      setEditingScenarioId(selectedScenario.id)
                      setIsScenarioDialogOpen(true)
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    シナリオを編集
                  </Button>
                )
              }
              return null
            })()}
          </div>

          {/* 時間帯選択とGM選択 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="timeSlot">時間帯</Label>
              <Select 
                value={timeSlot} 
                onValueChange={(value: 'morning' | 'afternoon' | 'evening') => handleTimeSlotChange(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">{timeSlotDefaults.morning.label}</SelectItem>
                  <SelectItem value="afternoon">{timeSlotDefaults.afternoon.label}</SelectItem>
                  <SelectItem value="evening">{timeSlotDefaults.evening.label}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                時間帯を選択すると開始・終了時間が自動設定されます
              </p>
            </div>

            {/* GM管理 */}
            <div>
              <Label htmlFor="gms">GM</Label>
              <MultiSelect
                options={(() => {
                  const options = staff
                    .filter(s => s.status === 'active')
                    .map(staffMember => {
                      // このシナリオの担当GMかチェック
                      const isAssignedGM = formData.scenario && 
                        (staffMember.special_scenarios?.includes(formData.scenario) ||
                         scenarios.find(sc => sc.title === formData.scenario)?.id &&
                         staffMember.special_scenarios?.includes(scenarios.find(sc => sc.title === formData.scenario)!.id))
                      
                      // 出勤可能かチェック
                      // シナリオが選択されている場合: そのシナリオで出勤可能か
                      // シナリオ未選択の場合: その日時に出勤しているか
                      let isAvailable = false
                      if (formData.scenario) {
                        const availableGMs = availableStaffByScenario?.[formData.scenario] || []
                        isAvailable = availableGMs.some(gm => gm.id === staffMember.id)
                      } else {
                        // シナリオ未選択時は、その日時に出勤している全GMから判定
                        isAvailable = allAvailableStaff.some(gm => gm.id === staffMember.id)
                      }
                      
                      // 表示情報を構築
                      const displayParts: string[] = []
                      if (isAvailable) displayParts.push('出勤可能')
                      if (isAssignedGM) displayParts.push('担当GM')
                      
                      return {
                        id: staffMember.id,
                        name: staffMember.name,
                        displayInfo: displayParts.length > 0 ? displayParts.join(' / ') : undefined,
                        sortOrder: isAvailable ? 0 : isAssignedGM ? 1 : 2
                      }
                    })
                    .sort((a, b) => {
                      // sortOrderで優先順位を決定
                      if (a.sortOrder !== b.sortOrder) {
                        return a.sortOrder - b.sortOrder
                      }
                      // 同じ優先順位の場合は名前順
                      return a.name.localeCompare(b.name, 'ja')
                    })
                    .map(({ id, name, displayInfo }) => ({ id, name, displayInfo }))
                  
                  return options
                })()}
                selectedValues={formData.gms}
                onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
                placeholder="GMを選択"
                closeOnSelect={true}
                emptyText="GMが見つかりません"
                emptyActionLabel="+ GMを作成"
                onEmptyAction={() => setIsStaffModalOpen(true)}
              />
              {/* GM選択バッジ表示 */}
              {formData.gms.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.gms.map((gm: string, index: number) => {
                    const role = formData.gmRoles?.[gm] || 'main'
                    const badgeStyle = role === 'sub' 
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200' 
                      : role === 'staff' 
                        ? 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200'
                    
                    return (
                      <Popover key={index}>
                        <PopoverTrigger asChild>
                          <div 
                            className={cn(
                              badgeVariants({ variant: "outline" }),
                              "flex items-center gap-1 font-normal border cursor-pointer rounded-[4px] pr-1",
                              badgeStyle
                            )}
                            role="button"
                          >
                            <span className="flex items-center">
                              <UserCog className="h-3 w-3 mr-1 opacity-70" />
                              {gm}
                              {role === 'sub' && <span className="text-[10px] ml-1 font-bold">(サブ)</span>}
                              {role === 'staff' && <span className="text-[10px] ml-1 font-bold">(参加)</span>}
                            </span>
                            <div
                              role="button"
                              className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-black/10 ml-1"
                              onClick={(e) => {
                                e.stopPropagation()
                          const newGms = formData.gms.filter((g: string) => g !== gm)
                                const newRoles = { ...formData.gmRoles }
                                delete newRoles[gm]
                                setFormData((prev: EventFormData) => ({ ...prev, gms: newGms, gmRoles: newRoles }))
                        }}
                      >
                        <X className="h-3 w-3" />
                </div>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-3" align="start">
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <h4 className="font-medium text-xs text-muted-foreground">役割を選択</h4>
                              <RadioGroup 
                                value={role} 
                                onValueChange={(value) => setFormData((prev: any) => ({
                                  ...prev,
                                  gmRoles: { ...prev.gmRoles, [gm]: value }
                                }))}
                              >
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="main" id={`role-main-${index}`} />
                                  <Label htmlFor={`role-main-${index}`} className="text-sm cursor-pointer">メインGM</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="sub" id={`role-sub-${index}`} />
                                  <Label htmlFor={`role-sub-${index}`} className="text-sm cursor-pointer">サブGM</Label>
                                </div>
                                <div className="flex items-center space-x-2 py-1">
                                  <RadioGroupItem value="staff" id={`role-staff-${index}`} />
                                  <Label htmlFor={`role-staff-${index}`} className="text-sm cursor-pointer">スタッフ参加</Label>
                                </div>
                              </RadioGroup>
                            </div>
                            
                            {role === 'sub' && (
                              <p className="text-[10px] text-blue-600 bg-blue-50 p-1 rounded">
                                ※サブGM給与が適用されます
                              </p>
                            )}
                            {role === 'staff' && (
                              <p className="text-[10px] text-green-600 bg-green-50 p-1 rounded">
                                ※予約リストに追加されます(無料)
                              </p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select 
                value={formData.start_time?.slice(0, 5)} 
                onValueChange={handleStartTimeChange}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="開始時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.start_time && !formData.is_private_request && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {formData.start_time.slice(0, 5)}
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切リクエストの日時は変更できません
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="end_time">終了時間</Label>
              <Select 
                value={formData.end_time?.slice(0, 5)} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="終了時間を選択" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map(time => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'edit' && formData.end_time && !formData.is_private_request && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {formData.end_time.slice(0, 5)}
                </p>
              )}
            </div>
          </div>

          {/* カテゴリと参加者数 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">公演カテゴリ</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: string) => {
                  // カテゴリ変更時もシナリオを維持
                  setFormData((prev: EventFormData) => ({ 
                    ...prev, 
                    category: value,
                    // 既存のシナリオ選択を明示的に保持
                    scenario: prev.scenario,
                    gms: prev.gms,
                    gmRoles: prev.gmRoles
                  }))
                }}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">オープン公演</SelectItem>
                  <SelectItem value="private">貸切公演</SelectItem>
                  <SelectItem value="gmtest">GMテスト</SelectItem>
                  <SelectItem value="testplay">テストプレイ</SelectItem>
                  <SelectItem value="offsite">出張公演</SelectItem>
                  <SelectItem value="venue_rental">場所貸し</SelectItem>
                  <SelectItem value="venue_rental_free">場所貸無料</SelectItem>
                  <SelectItem value="package">パッケージ会</SelectItem>
                </SelectContent>
              </Select>
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切リクエストのため変更できません
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="max_participants">最大参加者数</Label>
              <Input
                id="max_participants"
                type="number"
                min="1"
                max="20"
                value={formData.max_participants}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
                disabled={formData.is_private_request}
              />
              {formData.scenario && (
                <p className="text-xs text-muted-foreground mt-1">
                  ※ シナリオから自動設定されました
                </p>
              )}
              {formData.is_private_request && (
                <p className="text-xs text-purple-600 mt-1">
                  ※ 貸切公演は最大人数固定です
                </p>
              )}
            </div>
          </div>

          {/* 備考 */}
          <div>
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
              placeholder="備考があれば入力してください"
              rows={3}
            />
          </div>
        </div>

          {/* アクションボタン削除 */}
          </TabsContent>
          
          <TabsContent value="reservations" className="flex-1 overflow-y-auto p-6 mt-0">
            <ReservationList
              event={event || null}
              currentEventData={formData}
              mode={mode}
              stores={stores}
              scenarios={scenarios}
              staff={staff}
              onParticipantChange={onParticipantChange}
            />
          </TabsContent>
        </Tabs>

        {/* フッターアクションボタン */}
        <div className="flex justify-end gap-2 p-4 border-t bg-background shrink-0">
          <Button variant="outline" onClick={onClose} className="min-w-[100px]">
            キャンセル
          </Button>
          <Button onClick={handleSave} className="min-w-[100px]">
            {mode === 'add' ? '追加' : '保存'}
          </Button>
        </div>
      </DialogContent>

      {/* シナリオ編集ダイアログ */}
      <ScenarioEditDialog
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
        scenarios={scenarios as any}
      />
    </Dialog>
  )
}
