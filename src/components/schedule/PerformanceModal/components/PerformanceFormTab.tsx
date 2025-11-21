// 公演情報フォームタブコンポーネント

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { X, ExternalLink } from 'lucide-react'
import { DEFAULT_MAX_PARTICIPANTS } from '@/constants/game'
import { timeOptions } from '../utils/timeOptions'
import type { Store, Scenario, Staff } from '@/types'
import type { ModalMode } from '../types'

interface PerformanceFormTabProps {
  mode: ModalMode
  formData: any
  setFormData: (data: any) => void
  stores: Store[]
  scenarios: Scenario[]
  staff: Staff[]
  timeSlot: string
  timeSlotDefaults: any
  onTimeSlotChange: (slot: 'morning' | 'afternoon' | 'evening') => void
  onStartTimeChange: (time: string) => void
  onScenarioEditClick: (scenarioId: string) => void
  onStaffCreateClick: () => void
  onSave: () => void
  onClose: () => void
}

export function PerformanceFormTab({
  mode,
  formData,
  setFormData,
  stores,
  scenarios,
  staff,
  timeSlot,
  timeSlotDefaults,
  onTimeSlotChange,
  onStartTimeChange,
  onScenarioEditClick,
  onStaffCreateClick,
  onSave,
  onClose
}: PerformanceFormTabProps) {
  
  const getStoreName = (storeId: string) => {
    return stores.find(s => s.id === storeId)?.name || ''
  }

  const calculateEndTime = (startTime: string, scenarioTitle: string) => {
    const scenario = scenarios.find(s => s.title === scenarioTitle)
    if (!scenario || !startTime) return startTime

    const duration = scenario.duration || 240
    const [hours, minutes] = startTime.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, hours, minutes + duration)
    return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-3 md:space-y-4">
      {/* 基本情報 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div>
          <Label htmlFor="date" className="text-xs md:text-sm">日付</Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, date: e.target.value }))}
            className="text-xs md:text-sm"
          />
          {mode === 'edit' && formData.date && (
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
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
          <Label htmlFor="venue" className="text-xs md:text-sm">店舗</Label>
          <Select 
            value={formData.venue} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, venue: value }))}
          >
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue placeholder="店舗を選択">
                <div className="flex items-center gap-2">
                  <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[10px] md:text-xs" variant="secondary">
                    {getStoreName(formData.venue)}
                  </Badge>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {stores.map(store => (
                <SelectItem key={store.id} value={store.id} className="text-xs md:text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-gray-100 border-0 rounded-[2px] font-normal text-[10px] md:text-xs" variant="secondary">
                      {store.name}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 時間帯選択とGM選択 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div>
          <Label htmlFor="timeSlot" className="text-xs md:text-sm">時間帯</Label>
          <Select 
            value={timeSlot} 
            onValueChange={(value: 'morning' | 'afternoon' | 'evening') => onTimeSlotChange(value)}
          >
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning" className="text-xs md:text-sm">{timeSlotDefaults.morning.label}</SelectItem>
              <SelectItem value="afternoon" className="text-xs md:text-sm">{timeSlotDefaults.afternoon.label}</SelectItem>
              <SelectItem value="evening" className="text-xs md:text-sm">{timeSlotDefaults.evening.label}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
            時間帯を選択すると開始・終了時間が自動設定されます
          </p>
        </div>

        {/* GM管理 */}
        <div>
          <Label htmlFor="gms" className="text-xs md:text-sm">GM</Label>
          <MultiSelect
            options={staff
              .filter(s => s.status === 'active')
              .map(staffMember => {
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
                if (a.isAssignedGM && !b.isAssignedGM) return -1
                if (!a.isAssignedGM && b.isAssignedGM) return 1
                return a.name.localeCompare(b.name, 'ja')
              })}
            selectedValues={formData.gms}
            onSelectionChange={(values) => setFormData((prev: any) => ({ ...prev, gms: values }))}
            placeholder="GMを選択"
            closeOnSelect={true}
            emptyText="GMが見つかりません"
            emptyActionLabel="+ GMを作成"
            onEmptyAction={onStaffCreateClick}
          />
          {/* GM選択バッジ表示 */}
          {formData.gms.length > 0 && (
            <div className="flex flex-wrap gap-1 md:gap-2 mt-2">
              {formData.gms.map((gm: string, index: number) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1 font-normal bg-gray-100 border-0 rounded-[2px] text-[10px] md:text-xs">
                  {gm}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-3 w-3 md:h-4 md:w-4 p-0 hover:bg-red-100"
                    onClick={() => {
                      const newGms = formData.gms.filter((g: string) => g !== gm)
                      setFormData((prev: any) => ({ ...prev, gms: newGms }))
                    }}
                  >
                    <X className="h-2 w-2 md:h-3 md:w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 時間設定 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div>
          <Label htmlFor="start_time" className="text-xs md:text-sm">開始時間</Label>
          <Select 
            value={formData.start_time} 
            onValueChange={onStartTimeChange}
            disabled={formData.is_private_request}
          >
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue placeholder="開始時間を選択">
                {formData.start_time ? formData.start_time.slice(0, 5) : "開始時間を選択"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {timeOptions.map(time => (
                <SelectItem key={time} value={time} className="text-xs md:text-sm">{time}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === 'edit' && formData.start_time && !formData.is_private_request && (
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              現在: {formData.start_time.slice(0, 5)}
            </p>
          )}
          {formData.is_private_request && (
            <p className="text-[10px] md:text-xs text-purple-600 mt-1">
              ※ 貸切リクエストの日時は変更できません
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="end_time" className="text-xs md:text-sm">終了時間</Label>
          <Select 
            value={formData.end_time} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, end_time: value }))}
            disabled={formData.is_private_request}
          >
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue placeholder="終了時間を選択">
                {formData.end_time ? formData.end_time.slice(0, 5) : "終了時間を選択"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {timeOptions.map(time => (
                <SelectItem key={time} value={time} className="text-xs md:text-sm">{time}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === 'edit' && formData.end_time && !formData.is_private_request && (
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              現在: {formData.end_time.slice(0, 5)}
            </p>
          )}
        </div>
      </div>

      {/* カテゴリと参加者数 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        <div>
          <Label htmlFor="category" className="text-xs md:text-sm">公演カテゴリ</Label>
          <Select 
            value={formData.category} 
            onValueChange={(value: string) => {
              setFormData((prev: any) => ({ 
                ...prev, 
                category: value,
                scenario: prev.scenario,
                gms: prev.gms
              }))
            }}
            disabled={formData.is_private_request}
          >
            <SelectTrigger className="text-xs md:text-sm">
              <SelectValue placeholder="カテゴリを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open" className="text-xs md:text-sm">オープン公演</SelectItem>
              <SelectItem value="private" className="text-xs md:text-sm">貸切公演</SelectItem>
              <SelectItem value="gmtest" className="text-xs md:text-sm">GMテスト</SelectItem>
              <SelectItem value="testplay" className="text-xs md:text-sm">テストプレイ</SelectItem>
              <SelectItem value="offsite" className="text-xs md:text-sm">出張公演</SelectItem>
              <SelectItem value="venue_rental" className="text-xs md:text-sm">場所貸し</SelectItem>
              <SelectItem value="venue_rental_free" className="text-xs md:text-sm">場所貸無料</SelectItem>
              <SelectItem value="package" className="text-xs md:text-sm">パッケージ会</SelectItem>
            </SelectContent>
          </Select>
          {formData.is_private_request && (
            <p className="text-[10px] md:text-xs text-purple-600 mt-1">
              ※ 貸切リクエストのため変更できません
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="max_participants" className="text-xs md:text-sm">最大参加者数</Label>
          <Input
            id="max_participants"
            type="number"
            min="1"
            max="20"
            value={formData.max_participants}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, max_participants: parseInt(e.target.value) || DEFAULT_MAX_PARTICIPANTS }))}
            disabled={formData.is_private_request}
            className="text-xs md:text-sm"
          />
          {formData.scenario && (
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
              ※ シナリオから自動設定されました
            </p>
          )}
          {formData.is_private_request && (
            <p className="text-[10px] md:text-xs text-purple-600 mt-1">
              ※ 貸切公演は最大人数固定です
            </p>
          )}
        </div>
      </div>

      {/* シナリオ */}
      <div>
        <Label htmlFor="scenario" className="text-xs md:text-sm">シナリオタイトル</Label>
        <Select
          value={formData.scenario}
          onValueChange={(scenarioTitle) => {
            const selectedScenario = scenarios.find(s => s.title === scenarioTitle)
            
            if (selectedScenario) {
              const endTime = calculateEndTime(formData.start_time, scenarioTitle)
              
              setFormData((prev: any) => ({
                ...prev,
                scenario: scenarioTitle,
                scenario_id: selectedScenario.id,
                end_time: endTime,
                max_participants: selectedScenario.player_count_max
              }))
            } else {
              setFormData((prev: any) => ({
                ...prev,
                scenario: scenarioTitle
              }))
            }
          }}
        >
          <SelectTrigger className="text-xs md:text-sm">
            <SelectValue placeholder="シナリオを選択" />
          </SelectTrigger>
          <SelectContent>
            {scenarios.map(scenario => (
              <SelectItem key={scenario.id} value={scenario.title} className="text-xs md:text-sm">
                {scenario.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formData.is_private_request && (
          <p className="text-[10px] md:text-xs text-purple-600 mt-1">
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
                className="mt-1 h-auto p-0 text-[10px] md:text-xs"
                onClick={() => onScenarioEditClick(selectedScenario.id)}
              >
                <ExternalLink className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" />
                シナリオを編集
              </Button>
            )
          }
          return null
        })()}
      </div>

      {/* 備考 */}
      <div>
        <Label htmlFor="notes" className="text-xs md:text-sm">備考</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, notes: e.target.value }))}
          placeholder="備考があれば入力してください"
          rows={3}
          className="text-xs md:text-sm"
        />
      </div>

      {/* アクションボタン */}
      <div className="flex justify-end gap-2 pt-3 md:pt-4 border-t">
        <Button variant="outline" onClick={onClose} className="text-xs md:text-sm h-8 md:h-10">
          キャンセル
        </Button>
        <Button onClick={onSave} className="text-xs md:text-sm h-8 md:h-10">
          {mode === 'add' ? '追加' : '保存'}
        </Button>
      </div>
    </div>
  )
}

