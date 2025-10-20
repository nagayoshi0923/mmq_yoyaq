import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import { MultiSelect } from '@/components/ui/multi-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ScenarioEditModal } from '@/components/modals/ScenarioEditModal'
import { StaffEditModal } from '@/components/modals/StaffEditModal'
import { scenarioApi, staffApi } from '@/lib/api'
import { reservationApi } from '@/lib/reservationApi'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import type { Staff as StaffType, Scenario, Store, Reservation } from '@/types'
import { logger } from '@/utils/logger'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' | 'venue_rental' | 'venue_rental_free' | 'package' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
  reservation_info?: string
}


interface EventFormData {
  date: string
  venue: string
  scenario: string
  scenario_id?: string
  category: string
  start_time: string
  end_time: string
  max_participants: number
  capacity: number
  gms: string[]
  notes?: string
  id?: string
  is_private_request?: boolean
  reservation_id?: string
}

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
  onScenariosUpdate?: () => void  // シナリオ作成後の更新用コールバック
  onStaffUpdate?: () => void  // スタッフ作成後の更新用コールバック
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
  onScenariosUpdate,
  onStaffUpdate
}: PerformanceModalProps) {
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false)
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
  const [timeSlot, setTimeSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [formData, setFormData] = useState<any>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    start_time: '10:00',
    end_time: '14:00',
    category: 'private',
    participant_count: 0,
    max_participants: DEFAULT_MAX_PARTICIPANTS,
    notes: ''
  })

  // 時間帯のデフォルト設定
  const timeSlotDefaults = {
    morning: { start_time: '10:00', end_time: '14:00', label: '朝公演' },
    afternoon: { start_time: '14:30', end_time: '18:30', label: '昼公演' },
    evening: { start_time: '19:00', end_time: '23:00', label: '夜公演' }
  }

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

  // 予約データを読み込む
  useEffect(() => {
    const loadReservations = async () => {
      if (mode === 'edit' && event?.id) {
        setLoadingReservations(true)
        try {
          const data = await reservationApi.getByScheduleEvent(event.id)
          setReservations(data)
        } catch (error) {
          logger.error('予約データの取得に失敗:', error)
          setReservations([])
        } finally {
          setLoadingReservations(false)
        }
      } else {
        setReservations([])
      }
    }
    
    loadReservations()
  }, [mode, event?.id])

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      setFormData(event)
      // 既存の開始時間から時間帯を判定
      const startHour = parseInt(event.start_time.split(':')[0])
      if (startHour < 12) {
        setTimeSlot('morning')
      } else if (startHour < 17) {
        setTimeSlot('afternoon')
      } else {
        setTimeSlot('evening')
      }
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
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        category: 'private',
        participant_count: 0,
        max_participants: DEFAULT_MAX_PARTICIPANTS,
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

  // シナリオ選択時の自動設定
  const handleScenarioChange = (scenarioTitle: string) => {
    const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
    
    if (selectedScenario) {
      const endTime = calculateEndTime(formData.start_time, scenarioTitle)
      
      setFormData((prev: EventFormData) => ({
        ...prev,
        scenario: scenarioTitle,
        end_time: endTime,
        max_participants: selectedScenario.player_count_max
      }))
    } else {
      setFormData((prev: EventFormData) => ({
        ...prev,
        scenario: scenarioTitle
      }))
    }
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

  const handleSave = () => {
    onSave(formData)
    onClose()
  }

  const handleCreateScenario = async (newScenario: Scenario) => {
    try {
      // データベースに送信する前に不要なフィールドを除外
      const { 
        id, 
        created_at, 
        updated_at, 
        production_costs, 
        available_gms, 
        play_count, 
        required_props,
        flexible_pricing,
        ...scenarioForDB 
      } = newScenario as any
      
      logger.log('シナリオ作成リクエスト:', scenarioForDB)
      const createdScenario = await scenarioApi.create(scenarioForDB)
      logger.log('シナリオ作成成功:', createdScenario)
      setIsScenarioModalOpen(false)
      // 親コンポーネントにシナリオリストの更新を通知
      if (onScenariosUpdate) {
        await onScenariosUpdate()
      }
      // 新しく作成したシナリオを選択
      setFormData((prev: EventFormData) => ({ ...prev, scenario: newScenario.title }))
    } catch (error: unknown) {
      logger.error('シナリオ作成エラー:', error)
      const message = error instanceof Error ? error.message : '不明なエラー'
      alert(`シナリオの作成に失敗しました: ${message}`)
    }
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
        gms: [...prev.gms, newStaff.name] 
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

  // 店舗カラーを取得
  const getStoreColor = (storeId: string) => {
    const store = stores.find(s => s.id === storeId)
    const storeColors: { [key: string]: string } = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      purple: 'bg-purple-100 text-purple-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
      amber: 'bg-amber-100 text-amber-800'
    }
    return store ? storeColors[store.color] || 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-800'
  }

  const modalTitle = mode === 'add' ? '新しい公演を追加' : '公演を編集'
  const modalDescription = mode === 'add' ? '新しい公演の詳細情報を入力してください。' : '公演の詳細情報を編集してください。'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="edit" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">公演情報</TabsTrigger>
            <TabsTrigger value="reservations">予約者</TabsTrigger>
          </TabsList>
          
          <TabsContent value="edit" className="mt-4 overflow-y-auto flex-1">
            <div className="space-y-4">
          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">日付</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))}
              />
              {mode === 'edit' && formData.date && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {new Date(formData.date + 'T00:00:00').toLocaleDateString('ja-JP', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    weekday: 'short'
                  })}
                </p>
              )}
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
                      <Badge className={getStoreColor(formData.venue)} variant="static">
                        {getStoreName(formData.venue)}
                      </Badge>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      <div className="flex items-center gap-2">
                        <Badge className={getStoreColor(store.id)} variant="static">
                          {store.name}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 時間帯選択 */}
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

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select 
                value={formData.start_time} 
                onValueChange={handleStartTimeChange}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="開始時間を選択">
                    {formData.start_time ? formData.start_time.slice(0, 5) : "開始時間を選択"}
                  </SelectValue>
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
                value={formData.end_time} 
                onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
                disabled={formData.is_private_request}
              >
                <SelectTrigger>
                  <SelectValue placeholder="終了時間を選択">
                    {formData.end_time ? formData.end_time.slice(0, 5) : "終了時間を選択"}
                  </SelectValue>
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
                    gms: prev.gms
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

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
            <SearchableSelect
              options={scenarios.map(scenario => {
                const hours = scenario.duration / 60
                const displayHours = hours % 1 === 0 ? hours.toFixed(1) : hours.toFixed(1)
                
                // 担当GMを取得
                const allGMsForScenario = staff.filter(s => 
                  s.role?.includes('gm') && 
                  (s.special_scenarios?.includes(scenario.id) || s.special_scenarios?.includes(scenario.title))
                )
                
                const availableGMs = availableStaffByScenario[scenario.title] || []
                const availableStaffIds = new Set(availableGMs.map(gm => gm.id))
                
                // 検索キーワード（読み仮名）を準備
                const searchKeywords = [
                  (scenario as any).reading_katakana,
                  (scenario as any).reading_alphabet,
                  scenario.author
                ].filter(Boolean)
                
                return {
                  value: scenario.title,
                  label: scenario.title,
                  displayInfo: `${displayHours}h | ${scenario.player_count_min}-${scenario.player_count_max}人`,
                  searchKeywords,
                  renderContent: () => (
                    <div className="flex items-center gap-2 w-full">
                      {/* タイトル */}
                      <span className="flex-shrink-0 min-w-0 truncate">{scenario.title}</span>
                      
                      {/* 時間・人数 */}
                      <span className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {displayHours}h | {scenario.player_count_min}-{scenario.player_count_max}人
                      </span>
                      
                      {/* 担当GMバッジ */}
                      {allGMsForScenario.length > 0 && (
                        <div className="flex gap-0.5 flex-shrink-0">
                          {allGMsForScenario.slice(0, 6).map((gm) => {
                            const isAvailable = availableStaffIds.has(gm.id)
                            const hash = gm.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                            const colors = ['#EFF6FF', '#F0FDF4', '#FFFBEB', '#FEF2F2', '#F5F3FF', '#FDF2F8', '#ECFEFF', '#F7FEE7']
                            const textColors = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2', '#65A30D']
                            const bgColor = gm.avatar_color || colors[hash % colors.length]
                            const textColor = gm.avatar_color ? 
                              ({'#EFF6FF': '#2563EB', '#F0FDF4': '#16A34A', '#FFFBEB': '#D97706', '#FEF2F2': '#DC2626', '#F5F3FF': '#7C3AED', '#FDF2F8': '#DB2777', '#ECFEFF': '#0891B2', '#F7FEE7': '#65A30D'}[gm.avatar_color] || '#374151') :
                              textColors[hash % textColors.length]
                            
                            return (
                              <Badge 
                                key={gm.id} 
                                variant="outline"
                                style={isAvailable ? { 
                                  backgroundColor: bgColor, 
                                  color: textColor,
                                  borderColor: textColor + '40'
                                } : undefined}
                                className={`text-[10px] px-1 py-0 h-4 font-normal ${!isAvailable ? 'bg-gray-100 text-gray-400' : ''}`}
                              >
                                {gm.name.slice(0, 3)}
                              </Badge>
                            )
                          })}
                          {allGMsForScenario.length > 6 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal bg-gray-100 text-gray-500">
                              +{allGMsForScenario.length - 6}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }
              })}
              value={formData.scenario}
              onValueChange={handleScenarioChange}
              placeholder="シナリオを検索..."
              searchPlaceholder="シナリオ名で検索..."
              emptyText="シナリオが見つかりません"
              onEmptyAction={() => setIsScenarioModalOpen(true)}
              emptyActionLabel="シナリオを作成"
              disabled={formData.is_private_request}
            />
            {formData.is_private_request && (
              <p className="text-xs text-purple-600 mt-1">
                ※ 貸切リクエストのシナリオは変更できません
              </p>
            )}
          </div>

          {/* GM管理 */}
          <div>
            <Label htmlFor="gms">GM</Label>
            <MultiSelect
              options={staff
                .filter(s => s.status === 'active')
                .map(staffMember => {
                  // このシナリオの担当GMかチェック
                  const isAssignedGM = formData.scenario && 
                    (staffMember.special_scenarios?.includes(formData.scenario) ||
                     scenarios.find(sc => sc.title === formData.scenario)?.id &&
                     staffMember.special_scenarios?.includes(scenarios.find(sc => sc.title === formData.scenario)!.id))
                  
                  return {
                    id: staffMember.id,
                    name: staffMember.name,
                    displayInfo: isAssignedGM ? '担当GM' : undefined,
                    isAssignedGM
                  }
                })
                .sort((a, b) => {
                  // 担当GMを上に表示
                  if (a.isAssignedGM && !b.isAssignedGM) return -1
                  if (!a.isAssignedGM && b.isAssignedGM) return 1
                  // 両方とも担当GMまたは両方とも非担当GMの場合は名前順
                  return a.name.localeCompare(b.name, 'ja')
                })}
              selectedValues={formData.gms}
              onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
              placeholder="GMを選択"
              closeOnSelect={true}
              emptyText="GMが見つかりません"
              emptyActionLabel="+ GMを作成"
              onEmptyAction={() => setIsStaffModalOpen(true)}
            />
            {formData.gms.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.gms.map((gm: string, index: number) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1 font-normal">
                    {gm}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-red-100"
                      onClick={() => {
                        const newGms = formData.gms.filter((g: string) => g !== gm)
                        setFormData((prev: EventFormData) => ({ ...prev, gms: newGms }))
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
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

        {/* アクションボタン */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>
            {mode === 'add' ? '追加' : '保存'}
          </Button>
        </div>
          </TabsContent>
          
          <TabsContent value="reservations" className="mt-4 overflow-y-auto flex-1">
            {loadingReservations ? (
              <div className="text-center py-8 text-muted-foreground">
                読み込み中...
              </div>
            ) : reservations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                予約はありません
              </div>
            ) : (
              <div className="space-y-3">
                {reservations.map((reservation, index) => (
                  <div key={reservation.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-lg">{reservation.customer_name}</span>
                        <Badge variant={reservation.status === 'confirmed' ? 'default' : 'secondary'}>
                          {reservation.status === 'confirmed' ? '確定' : '保留中'}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">予約#{index + 1}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {reservation.customer_email && (
                        <div>
                          <span className="text-muted-foreground">メール: </span>
                          <span>{reservation.customer_email}</span>
                        </div>
                      )}
                      {reservation.customer_phone && (
                        <div>
                          <span className="text-muted-foreground">電話: </span>
                          <span>{reservation.customer_phone}</span>
                        </div>
                      )}
                      {reservation.participant_count && (
                        <div>
                          <span className="text-muted-foreground">参加人数: </span>
                          <span>{reservation.participant_count}名</span>
                        </div>
                      )}
                    </div>
                    
                    {reservation.notes && (
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">備考: </span>
                        <span>{reservation.notes}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* シナリオ作成モーダル */}
      <ScenarioEditModal
        scenario={null}
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        onSave={handleCreateScenario}
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
