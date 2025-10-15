import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { StaffAvatar } from '@/components/staff/StaffAvatar'
import type { Staff as StaffType } from '@/types'

// スケジュールイベントの型定義
interface ScheduleEvent {
  id: string
  date: string // YYYY-MM-DD
  venue: string // 店舗ID
  scenario: string
  gms: string[] // GMの名前の配列
  start_time: string // HH:MM
  end_time: string // HH:MM
  category: 'open' | 'private' | 'gmtest' | 'testplay' | 'offsite' // 公演カテゴリ
  is_cancelled: boolean
  participant_count?: number
  max_participants?: number
  notes?: string
  is_private_request?: boolean // 貸切リクエストかどうか
  reservation_id?: string // 貸切リクエストの元のreservation ID
  reservation_info?: string
}

interface Store {
  id: string
  name: string
  short_name: string
  color: string
}

interface Scenario {
  id: string
  title: string
  description: string
  author: string
  duration: number
  player_count_min: number
  player_count_max: number
  difficulty: number
  genre: string[]
  status: string
}

interface Staff {
  id: string
  name: string
  line_name: string
  role: string[]
  stores: string[]
  experience: number
  status: string
}

interface PerformanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (eventData: any) => void
  mode: 'add' | 'edit'
  event?: ScheduleEvent | null  // 編集時のみ
  initialData?: { date: string, venue: string, timeSlot: string }  // 追加時のみ
  stores: Store[]
  scenarios: Scenario[]
  staff: Staff[]
  availableStaffByScenario?: Record<string, StaffType[]>  // シナリオごとの出勤可能GM
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
  availableStaffByScenario = {}
}: PerformanceModalProps) {
  const [formData, setFormData] = useState<any>({
    id: '',
    date: '',
    venue: '',
    scenario: '',
    gms: [],
    start_time: '10:00',
    end_time: '14:00',
    category: 'open',
    participant_count: 0,
    max_participants: 8,
    notes: ''
  })

  // モードに応じてフォームを初期化
  useEffect(() => {
    if (mode === 'edit' && event) {
      // 編集モード：既存データで初期化
      setFormData(event)
    } else if (mode === 'add' && initialData) {
      // 追加モード：初期データで初期化
      const timeSlotDefaults = {
        morning: { start_time: '10:00', end_time: '14:00' },
        afternoon: { start_time: '14:30', end_time: '18:30' },
        evening: { start_time: '19:00', end_time: '23:00' }
      }
      
      const defaults = timeSlotDefaults[initialData.timeSlot as keyof typeof timeSlotDefaults] || timeSlotDefaults.morning
      
      setFormData({
        id: Date.now().toString(),
        date: initialData.date,
        venue: initialData.venue,
        scenario: '',
        gms: [],
        start_time: defaults.start_time,
        end_time: defaults.end_time,
        category: 'open',
        participant_count: 0,
        max_participants: 8,
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
      
      setFormData((prev: any) => ({
        ...prev,
        scenario: scenarioTitle,
        end_time: endTime,
        max_participants: selectedScenario.player_count_max
      }))
    } else {
      setFormData((prev: any) => ({
        ...prev,
        scenario: scenarioTitle
      }))
    }
  }

  // 開始時間変更時の自動設定
  const handleStartTimeChange = (startTime: string) => {
    const endTime = formData.scenario ? calculateEndTime(startTime, formData.scenario) : startTime
    
    setFormData((prev: any) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime
    }))
  }

  const handleSave = () => {
    onSave(formData)
    onClose()
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            {modalDescription}
          </DialogDescription>
        </DialogHeader>
        
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
                onValueChange={(value: any) => setFormData((prev: any) => ({ ...prev, category: value }))}
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
                onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || 8 }))}
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
            <Combobox
              options={scenarios.map(scenario => {
                const hours = scenario.duration / 60
                const displayHours = hours % 1 === 0 ? hours.toFixed(1) : hours.toFixed(1)
                
                return {
                  value: scenario.title,
                  label: scenario.title,
                  displayInfo: `${displayHours}h | ${scenario.player_count_min}-${scenario.player_count_max}人`
                }
              })}
              value={formData.scenario}
              onValueChange={handleScenarioChange}
              placeholder="シナリオを検索..."
              searchPlaceholder="シナリオ名で検索..."
              emptyText="シナリオが見つかりません"
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
                .map(staffMember => ({
                  id: staffMember.id,
                  name: staffMember.name,
                  displayInfo: staffMember.role && staffMember.role.includes('gm') ? 'GM' : 'スタッフ'
                }))}
              selectedValues={formData.gms}
              onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
              placeholder="GMを選択"
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
                        setFormData((prev: any) => ({ ...prev, gms: newGms }))
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
      </DialogContent>
    </Dialog>
  )
}
