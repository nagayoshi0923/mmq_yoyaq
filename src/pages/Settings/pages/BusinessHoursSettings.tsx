import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Plus, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { getCurrentOrganizationId } from '@/lib/organization'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

interface SlotTimes {
  morning: string
  afternoon: string
  evening: string
}

interface DayHours {
  is_open: boolean
  open_time: string
  close_time: string
  available_slots: ('morning' | 'afternoon' | 'evening')[] // 受付可能な公演枠
  slot_start_times?: SlotTimes // 公演枠ごとの開始時間（オプション）
}

interface OpeningHours {
  monday: DayHours
  tuesday: DayHours
  wednesday: DayHours
  thursday: DayHours
  friday: DayHours
  saturday: DayHours
  sunday: DayHours
}

interface BusinessHoursData {
  id: string
  store_id: string
  opening_hours: OpeningHours | null
  holidays: string[] // 特定日の休業日
  special_open_days: { date: string; note: string }[]
  special_closed_days: { date: string; note: string }[]
}

const weekdays = [
  { value: 'monday', label: '月曜日', short: '月' },
  { value: 'tuesday', label: '火曜日', short: '火' },
  { value: 'wednesday', label: '水曜日', short: '水' },
  { value: 'thursday', label: '木曜日', short: '木' },
  { value: 'friday', label: '金曜日', short: '金' },
  { value: 'saturday', label: '土曜日', short: '土' },
  { value: 'sunday', label: '日曜日', short: '日' }
] as const

// 公演枠の定義
const slotOptions = [
  { value: 'morning' as const, label: '朝公演', defaultTime: '10:00' },
  { value: 'afternoon' as const, label: '昼公演', defaultTime: '14:00' },
  { value: 'evening' as const, label: '夜公演', defaultTime: '18:00' }
]

// デフォルトの開始時間（土日祝用）
const defaultSlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '14:00',
  evening: '19:00'
}

// 平日用の開始時間（昼公演は13:00開始）
const weekdaySlotTimes: SlotTimes = {
  morning: '10:00',
  afternoon: '13:00',
  evening: '19:00'
}

// デフォルトの営業時間設定
const defaultWeekdayHours: DayHours = { 
  is_open: true, 
  open_time: '13:00', 
  close_time: '23:00',
  available_slots: ['afternoon', 'evening'], // 平日は昼・夜のみ
  slot_start_times: weekdaySlotTimes
}
const defaultWeekendHours: DayHours = { 
  is_open: true, 
  open_time: '09:00', 
  close_time: '23:00',
  available_slots: ['morning', 'afternoon', 'evening'], // 土日は全公演
  slot_start_times: defaultSlotTimes
}

const getDefaultOpeningHours = (): OpeningHours => ({
  monday: { ...defaultWeekdayHours },
  tuesday: { ...defaultWeekdayHours },
  wednesday: { ...defaultWeekdayHours },
  thursday: { ...defaultWeekdayHours },
  friday: { ...defaultWeekdayHours },
  saturday: { ...defaultWeekendHours },
  sunday: { ...defaultWeekendHours }
})

// DBから取得したデータにデフォルト値をマージする関数
// slot_start_timesなどが欠けている古いデータ用
const mergeWithDefaults = (dbOpeningHours: OpeningHours | null): OpeningHours => {
  const defaults = getDefaultOpeningHours()
  if (!dbOpeningHours) return defaults
  
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const result: OpeningHours = { ...defaults }
  
  for (const day of weekdays) {
    const isWeekend = day === 'saturday' || day === 'sunday'
    const defaultHours = isWeekend ? defaultWeekendHours : defaultWeekdayHours
    const dbDay = dbOpeningHours[day]
    
    if (dbDay) {
      // slot_start_timesは個々のプロパティをマージ（部分的に設定されている場合に対応）
      const mergedSlotTimes: SlotTimes = {
        morning: dbDay.slot_start_times?.morning || defaultHours.slot_start_times?.morning || '10:00',
        afternoon: dbDay.slot_start_times?.afternoon || defaultHours.slot_start_times?.afternoon || '13:00',
        evening: dbDay.slot_start_times?.evening || defaultHours.slot_start_times?.evening || '19:00'
      }
      
      // DBのデータがある場合、デフォルトとマージ
      result[day] = {
        ...defaultHours,  // まずデフォルトを適用
        ...dbDay,         // DBのデータで上書き
        // slot_start_timesは個々のプロパティをマージ
        slot_start_times: mergedSlotTimes,
        // available_slotsも同様
        available_slots: dbDay.available_slots || defaultHours.available_slots
      }
    }
  }
  
  return result
}

interface BusinessHoursSettingsProps {
  storeId?: string
}

export function BusinessHoursSettings({ storeId }: BusinessHoursSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<BusinessHoursData>({
    id: '',
    store_id: '',
    opening_hours: getDefaultOpeningHours(),
    holidays: [],
    special_open_days: [],
    special_closed_days: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newOpenDay, setNewOpenDay] = useState({ date: '', note: '' })
  const [newClosedDay, setNewClosedDay] = useState({ date: '', note: '' })

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeId変更時のみ実行
  }, [storeId])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 店舗データを取得（組織対応済み、オフィス除外）
      const storesData = await storeApi.getAll(false, undefined, false, true)

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        const initialStoreId = storeId || storesData[0].id
        setSelectedStoreId(initialStoreId)
        await fetchBusinessHours(initialStoreId)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchBusinessHours = async (targetStoreId: string) => {
    try {
      // まず基本カラムのみで取得（確実に動作する）
      const { data: basicData, error: basicError } = await supabase
        .from('business_hours_settings')
        .select('id, store_id, opening_hours, holidays')
        .eq('store_id', targetStoreId)
        .maybeSingle()

      if (basicError && basicError.code !== 'PGRST116') {
        throw basicError
      }

      if (basicData) {
        // 基本データがあれば設定（slot_start_timesがない古いデータ用にデフォルト値をマージ）
        setFormData({
          ...basicData,
          opening_hours: mergeWithDefaults(basicData.opening_hours),
          holidays: basicData.holidays || [],
          special_open_days: [],
          special_closed_days: []
        })
      } else {
        // データが存在しない場合はデフォルト値
        setFormData({
          id: '',
          store_id: targetStoreId,
          opening_hours: getDefaultOpeningHours(),
          holidays: [],
          special_open_days: [],
          special_closed_days: []
        })
      }
    } catch (error) {
      logger.error('営業時間取得エラー:', error)
    }
  }

  const handleStoreChange = async (newStoreId: string) => {
    setSelectedStoreId(newStoreId)
    await fetchBusinessHours(newStoreId)
  }

  const updateDayHours = (day: keyof OpeningHours, field: keyof DayHours, value: string | boolean | string[]) => {
    setFormData(prev => ({
      ...prev,
      opening_hours: {
        ...(prev.opening_hours || getDefaultOpeningHours()),
        [day]: {
          ...(prev.opening_hours?.[day] || defaultWeekdayHours),
          [field]: value
        }
      }
    }))
  }
  
  const toggleSlot = (day: keyof OpeningHours, slot: 'morning' | 'afternoon' | 'evening') => {
    const currentSlots = formData.opening_hours?.[day]?.available_slots || []
    const newSlots = currentSlots.includes(slot)
      ? currentSlots.filter(s => s !== slot)
      : [...currentSlots, slot]
    updateDayHours(day, 'available_slots', newSlots)
  }
  
  const updateSlotStartTime = (day: keyof OpeningHours, slot: 'morning' | 'afternoon' | 'evening', time: string) => {
    const isWeekend = day === 'saturday' || day === 'sunday'
    const currentTimes = formData.opening_hours?.[day]?.slot_start_times || (isWeekend ? defaultSlotTimes : weekdaySlotTimes)
    setFormData(prev => ({
      ...prev,
      opening_hours: {
        ...(prev.opening_hours || getDefaultOpeningHours()),
        [day]: {
          ...(prev.opening_hours?.[day] || defaultWeekdayHours),
          slot_start_times: {
            ...currentTimes,
            [slot]: time
          }
        }
      }
    }))
  }

  const addSpecialOpenDay = () => {
    if (!newOpenDay.date) {
      showToast.warning('日付を入力してください')
      return
    }
    setFormData(prev => ({
      ...prev,
      special_open_days: [...prev.special_open_days, { ...newOpenDay }]
    }))
    setNewOpenDay({ date: '', note: '' })
  }

  const removeSpecialOpenDay = (index: number) => {
    setFormData(prev => ({
      ...prev,
      special_open_days: prev.special_open_days.filter((_, i) => i !== index)
    }))
  }

  const addSpecialClosedDay = () => {
    if (!newClosedDay.date) {
      showToast.warning('日付を入力してください')
      return
    }
    setFormData(prev => ({
      ...prev,
      special_closed_days: [...prev.special_closed_days, { ...newClosedDay }]
    }))
    setNewClosedDay({ date: '', note: '' })
  }

  const removeSpecialClosedDay = (index: number) => {
    setFormData(prev => ({
      ...prev,
      special_closed_days: prev.special_closed_days.filter((_, i) => i !== index)
    }))
  }

  const handleSave = async (applyToAll: boolean = false) => {
    setSaving(true)
    try {
      // 対象店舗リスト（全店舗に適用する場合はすべての店舗）
      const targetStores = applyToAll ? stores : [stores.find(s => s.id === selectedStoreId)].filter(Boolean)
      
      const orgId = await getCurrentOrganizationId()
      
      // 保存前にすべての曜日にslot_start_timesを確実に含める
      const openingHoursToSave = mergeWithDefaults(formData.opening_hours)
      
      // デバッグ：火曜日の設定を確認
      console.log('🔴 火曜日の設定（formData）:', JSON.stringify(formData.opening_hours?.tuesday, null, 2))
      console.log('🔴 火曜日の設定（保存用）:', JSON.stringify(openingHoursToSave.tuesday, null, 2))
      
      for (const store of targetStores) {
        if (!store) continue
        
        const saveData = {
          store_id: store.id,
          opening_hours: openingHoursToSave,
          holidays: formData.holidays,
          organization_id: orgId
        }
        
        logger.log('保存データ:', JSON.stringify(saveData, null, 2))
        
        // まず既存データを確認（RLS対応のため直接テーブルを確認しない）
        // 単純にupdateを試み、失敗したらinsert
        const { error: updateError, data: updateData } = await supabase
          .from('business_hours_settings')
          .update({
            opening_hours: openingHoursToSave,
            holidays: formData.holidays
          })
          .eq('store_id', store.id)
          .select('id')  // 更新された行を取得
        
        const updateCount = updateData?.length ?? 0
        logger.log('update結果:', { updateError, updateCount, updateData })
        
        // updateが失敗したか、更新行がなかった場合はinsert
        if (updateError || updateCount === 0) {
          logger.log('insertを実行')
          const { error: insertError } = await supabase
            .from('business_hours_settings')
            .insert(saveData)
          
          if (insertError) {
            logger.error('insertエラー:', insertError)
            throw insertError
          }
        }
      }
      
      // 保存成功時はフォームデータを維持（再取得しない）
      // 再取得するとRLSの問題でデフォルト値に戻る可能性があるため
      
      if (applyToAll) {
        showToast.success(`全${targetStores.length}店舗に適用しました`)
      } else {
        showToast.success('保存しました')
      }
    } catch (error: any) {
      logger.error('保存エラー:', error)
      logger.error('エラー詳細:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      })
      showToast.error(getSafeErrorMessage(error, '保存に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="営業時間設定"
        description="店舗ごとの曜日別営業時間と特別営業日を設定"
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
            全店舗に適用
          </Button>
          <Button onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </PageHeader>

      {/* 曜日ごとの営業時間 */}
      <Card>
        <CardHeader>
          <CardTitle>曜日ごとの営業時間</CardTitle>
          <CardDescription>
            平日（月〜金）と週末（土日）で異なる営業時間を設定できます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {weekdays.map(day => {
            const dayHours = formData.opening_hours?.[day.value as keyof OpeningHours] || defaultWeekdayHours
            const isWeekend = day.value === 'saturday' || day.value === 'sunday'
            const availableSlots = dayHours.available_slots || (isWeekend ? ['morning', 'afternoon', 'evening'] : ['afternoon', 'evening'])
            
            return (
              <div 
                key={day.value} 
                className={`p-3 rounded-lg ${isWeekend ? 'bg-blue-50' : 'bg-gray-50'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 font-medium">
                    <span className={isWeekend ? 'text-blue-600' : ''}>{day.short}</span>
                  </div>
                  
                  <Switch
                    checked={dayHours.is_open}
                    onCheckedChange={(checked) => updateDayHours(day.value as keyof OpeningHours, 'is_open', checked)}
                  />
                  
                  <span className={`text-sm w-10 ${dayHours.is_open ? '' : 'text-muted-foreground'}`}>
                    {dayHours.is_open ? '営業' : '休業'}
                  </span>
                  
                  {dayHours.is_open && (
                    <div className="flex-1">
                      {/* 公演枠選択と開始時間 */}
                      <div className="flex gap-2">
                        {slotOptions.map(slot => {
                          const isActive = availableSlots.includes(slot.value)
                          const slotTimes = dayHours.slot_start_times || (isWeekend ? defaultSlotTimes : weekdaySlotTimes)
                          const startTime = slotTimes[slot.value] || slot.defaultTime
                          
                          return (
                            <div key={slot.value} className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleSlot(day.value as keyof OpeningHours, slot.value)}
                                className={`px-2 py-1 text-xs rounded-l border transition-colors ${
                                  isActive 
                                    ? 'bg-purple-500 text-white border-purple-500' 
                                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                {slot.label}
                              </button>
                              {isActive && (
                                <Input
                                  type="time"
                                  value={startTime}
                                  onChange={(e) => updateSlotStartTime(day.value as keyof OpeningHours, slot.value, e.target.value)}
                                  className="w-20 h-6 text-xs rounded-l-none border-l-0"
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          
          <div className="text-sm text-muted-foreground mt-4 p-3 bg-amber-50 rounded-lg">
            <p className="font-medium text-amber-800">💡 公演枠と貸切リクエストの関係</p>
            <ul className="mt-2 space-y-1 text-amber-700">
              <li>• 選択した公演枠のみ貸切リクエストで選択可能になります</li>
              <li>• 例：平日は昼・夜のみ → 朝公演は選択不可</li>
              <li>• 特別営業日に登録した日は、平日でも土日の設定を適用</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 特別営業日（祝日など） */}
      <Card>
        <CardHeader>
          <CardTitle>特別営業日（土日営業）</CardTitle>
          <CardDescription>
            平日でも土日と同じ営業時間を適用する日（祝日、年末年始、お盆など）
            <br />
            <span className="text-xs">→ 朝公演10:00〜、昼公演14:00〜、夜公演18:00〜 が選択可能に</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="date"
              value={newOpenDay.date}
              onChange={(e) => setNewOpenDay(prev => ({ ...prev, date: e.target.value }))}
              placeholder="日付"
            />
            <Input
              value={newOpenDay.note}
              onChange={(e) => setNewOpenDay(prev => ({ ...prev, note: e.target.value }))}
              placeholder="備考（例：成人の日）"
            />
            <Button onClick={addSpecialOpenDay} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.special_open_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_open_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded bg-green-50">
                  <div>
                    <span className="font-medium">{day.date}</span>
                    {day.note && <span className="text-sm text-muted-foreground ml-2">- {day.note}</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSpecialOpenDay(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 特別休業日 */}
      <Card>
        <CardHeader>
          <CardTitle>特別休業日</CardTitle>
          <CardDescription>営業日でもお休みする日</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="date"
              value={newClosedDay.date}
              onChange={(e) => setNewClosedDay(prev => ({ ...prev, date: e.target.value }))}
              placeholder="日付"
            />
            <Input
              value={newClosedDay.note}
              onChange={(e) => setNewClosedDay(prev => ({ ...prev, note: e.target.value }))}
              placeholder="備考（例：店舗メンテナンス）"
            />
            <Button onClick={addSpecialClosedDay} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.special_closed_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_closed_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded bg-red-50">
                  <div>
                    <span className="font-medium">{day.date}</span>
                    {day.note && <span className="text-sm text-muted-foreground ml-2">- {day.note}</span>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSpecialClosedDay(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
