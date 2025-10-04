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
              <Badge className={getStoreColor(formData.venue)}>
                {getStoreName(formData.venue)}
              </Badge>
            </div>
          </div>

          {/* 時間設定 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">開始時間</Label>
              <Select value={formData.start_time} onValueChange={handleStartTimeChange}>
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
              {mode === 'edit' && formData.start_time && (
                <p className="text-xs text-muted-foreground mt-1">
                  現在: {formData.start_time.slice(0, 5)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="end_time">終了時間</Label>
              <Select value={formData.end_time} onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}>
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
              {mode === 'edit' && formData.end_time && (
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
              <Select value={formData.category} onValueChange={(value: any) => setFormData((prev: any) => ({ ...prev, category: value }))}>
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
              />
              {formData.scenario && (
                <p className="text-xs text-muted-foreground mt-1">
                  ※ シナリオから自動設定されました
                </p>
              )}
            </div>
          </div>

          {/* シナリオ */}
          <div>
            <Label htmlFor="scenario">シナリオタイトル</Label>
            <Select value={formData.scenario} onValueChange={handleScenarioChange}>
              <SelectTrigger>
                <SelectValue placeholder="シナリオを選択" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map(scenario => {
                  const availableGMs = availableStaffByScenario[scenario.title] || []
                  const hours = scenario.duration / 60
                  const displayHours = hours % 1 === 0 ? hours.toFixed(1) : hours.toFixed(1)
                  
                  // このシナリオを担当できる全スタッフ（GM役割 + このシナリオのspecial_scenarios含む）
                  const allGMsForScenario = staff.filter(s => 
                    s.role.includes('gm') && 
                    (s.special_scenarios?.includes(scenario.id) || s.special_scenarios?.includes(scenario.title))
                  )
                  
                  // 出勤可能なスタッフのIDセット
                  const availableStaffIds = new Set(availableGMs.map(gm => gm.id))
                  
                  return (
                    <SelectItem key={scenario.id} value={scenario.title}>
                      <div className="flex items-center gap-3 w-full">
                        {/* タイトル */}
                        <span className="flex-1 min-w-0 truncate">{scenario.title}</span>
                        
                        {/* 時間 */}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {displayHours}h
                        </span>
                        
                        {/* 人数 */}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {scenario.player_count_min}-{scenario.player_count_max}人
                        </span>
                        
                        {/* 全担当GMのバッジ表示（出勤可能=カラー、不可=灰色） */}
                        {allGMsForScenario.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {(() => {
                              // 出勤可能なGMを左に、不可を右に並べる
                              const availableGMs = allGMsForScenario.filter(gm => availableStaffIds.has(gm.id))
                              const unavailableGMs = allGMsForScenario.filter(gm => !availableStaffIds.has(gm.id))
                              const sortedGMs = [...availableGMs, ...unavailableGMs]
                              
                              // 最大8人まで表示
                              const displayGMs = sortedGMs.slice(0, 8)
                              const remainingCount = sortedGMs.length - 8
                              
                              // アバターと同じ色を計算
                              const defaultColors = [
                                '#EFF6FF', '#F0FDF4', '#FFFBEB', '#FEF2F2',
                                '#F5F3FF', '#FDF2F8', '#ECFEFF', '#F7FEE7'
                              ]
                              const textColors = [
                                '#2563EB', '#16A34A', '#D97706', '#DC2626',
                                '#7C3AED', '#DB2777', '#0891B2', '#65A30D'
                              ]
                              
                              return (
                                <>
                                  {displayGMs.map((gm) => {
                                    const isAvailable = availableStaffIds.has(gm.id)
                                    
                                    // avatarColorが設定されていればそれを使用、なければ名前から自動選択
                                    let bgColor: string
                                    let textColorHex: string
                                    
                                    if (gm.avatar_color) {
                                      bgColor = gm.avatar_color
                                      // 各背景色に対応する文字色を設定
                                      const colorMap: Record<string, string> = {
                                        '#EFF6FF': '#2563EB', // blue
                                        '#F0FDF4': '#16A34A', // green
                                        '#FFFBEB': '#D97706', // amber
                                        '#FEF2F2': '#DC2626', // red
                                        '#F5F3FF': '#7C3AED', // violet
                                        '#FDF2F8': '#DB2777', // pink
                                        '#ECFEFF': '#0891B2', // cyan
                                        '#F7FEE7': '#65A30D', // lime
                                      }
                                      textColorHex = colorMap[gm.avatar_color] || '#374151' // デフォルトはgray-700
                                    } else {
                                      const hash = gm.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
                                      const colorIndex = hash % defaultColors.length
                                      bgColor = defaultColors[colorIndex]
                                      textColorHex = textColors[colorIndex]
                                    }
                                    
                                    return (
                                      <Badge 
                                        key={gm.id} 
                                        variant="outline"
                                        style={isAvailable ? { 
                                          backgroundColor: bgColor, 
                                          color: textColorHex,
                                          borderColor: textColorHex + '40' // 25% opacity
                                        } : undefined}
                                        className={`text-[10px] px-1.5 py-0 h-5 font-normal ${!isAvailable ? 'bg-gray-100 text-gray-400 border-gray-200' : 'border'}`}
                                      >
                                        {gm.name.slice(0, 3)}
                                      </Badge>
                                    )
                                  })}
                                  {remainingCount > 0 && (
                                    <Badge 
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 h-5 font-normal bg-gray-100 text-gray-500 border-gray-200"
                                    >
                                      +{remainingCount}
                                    </Badge>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* GM管理 */}
          <div>
            <Label htmlFor="gms">GM</Label>
            <MultiSelect
              options={staff
                .filter(s => s.role.includes('gm') && s.status === 'active')
                .map(staffMember => ({
                  id: staffMember.id,
                  name: staffMember.name
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
