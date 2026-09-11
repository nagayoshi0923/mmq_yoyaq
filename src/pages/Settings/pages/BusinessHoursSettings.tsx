import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Clock, CalendarCheck, CalendarX, Plus, X, Save } from 'lucide-react'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { showToast } from '@/utils/toast'

import {
  weekdays, slotOptions, defaultSlotTimes, weekdaySlotTimes, defaultWeekdayHours,
  getDefaultOpeningHours, normalizeBusinessHoursData, businessHoursSaveFields,
  type OpeningHours, type DayHours, type BusinessHoursData,
} from '@/lib/storeBusinessHours'

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
  const loadVersion = useRef(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newOpenDay, setNewOpenDay] = useState({ date: '', note: '' })
  const [newClosedDay, setNewClosedDay] = useState({ date: '', note: '' })

  useEffect(() => {
    fetchData()
    return () => { loadVersion.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storeId変更時のみ実行
  }, [storeId])

  const fetchData = async () => {
    const version = ++loadVersion.current
    setLoading(true)
    setLoadFailed(false)
    try {
      // 店舗データを取得（組織対応済み、オフィス除外）
      const storesData = await storeApi.getAll(false, undefined, false, true)

      if (version !== loadVersion.current) return
      if (storesData && storesData.length > 0) {
        setStores(storesData)
        const initialStoreId = storeId || storesData[0].id
        setSelectedStoreId(initialStoreId)
        await fetchBusinessHours(initialStoreId)
      } else {
        setSelectedStoreId('')
        setLoading(false)
      }
    } catch (error) {
      if (version !== loadVersion.current) return
      setLoadFailed(true)
      setLoading(false)
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    }
  }

  const fetchBusinessHours = async (targetStoreId: string) => {
    const version = ++loadVersion.current
    setLoading(true)
    setLoadFailed(false)
    try {
      const data = await storeApi.getBusinessHours(targetStoreId)
      if (version === loadVersion.current) {
        setFormData(normalizeBusinessHoursData(targetStoreId, data))
      }
    } catch (error) {
      if (version === loadVersion.current) {
        setLoadFailed(true)
        logger.error('営業時間取得エラー:', error)
        showToast.error('営業時間を取得できませんでした。再読み込みしてください')
      }
    } finally {
      if (version === loadVersion.current) setLoading(false)
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
    if (loading || loadFailed || saving || formData.store_id !== selectedStoreId) return
    setSaving(true)
    try {
      // 対象店舗リスト（全店舗に適用する場合はすべての店舗）
      const targetStores = applyToAll ? stores : [stores.find(s => s.id === selectedStoreId)].filter(Boolean)
      
      if (targetStores.length === 0) throw new Error('対象店舗を確認できません')
      const fields = businessHoursSaveFields(formData)
      for (const store of targetStores) {
        if (store) await storeApi.saveBusinessHours(store.id, fields)
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="営業時間設定"
        description="店舗ごとの曜日別営業時間と特別営業日を設定します"
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving || loadFailed || !selectedStoreId}>
            全店舗に適用
          </Button>
          <Button size="sm" onClick={() => handleSave(false)} disabled={saving || loadFailed || !selectedStoreId}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </PageHeader>

      {/* 営業時間帯 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Clock}
          label="営業時間帯"
          description="曜日ごとに公演枠の受付可否を設定します。ここで有効にした枠のみ予約カレンダーに表示され、貸切リクエストでも選択可能になります。"
        />
        <div className="space-y-3">
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
                  <div className="w-12 font-medium text-sm">
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

          <div className="text-sm text-muted-foreground mt-2 p-3 bg-amber-50 rounded-lg">
            <p className="font-medium text-amber-800 text-xs">公演枠と貸切リクエストの関係</p>
            <ul className="mt-1.5 space-y-1 text-amber-700 text-xs">
              <li>• 選択した公演枠のみ貸切リクエストで選択可能になります</li>
              <li>• 例：平日は昼・夜のみ → 朝公演は選択不可</li>
              <li>• 特別営業日に登録した日は、平日でも土日の設定を適用</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 特別営業日 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CalendarCheck}
          label="特別営業日（土日営業）"
          description="平日でも土日と同じ営業時間を適用する日を登録します。祝日・年末年始・お盆など、朝公演を含む全公演枠が予約カレンダーに表示されます。"
        />
        <div className="space-y-4">
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
            <Button onClick={addSpecialOpenDay} variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {formData.special_open_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_open_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                  <div>
                    <span className="font-medium text-sm">{day.date}</span>
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

          {formData.special_open_days.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">特別営業日が登録されていません</p>
          )}
        </div>
      </section>

      {/* 特別休業日 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CalendarX}
          label="特別休業日"
          description="通常は営業日でも、この日は予約を受け付けない日として登録します。登録した日は予約カレンダーに「休業」と表示されます。"
        />
        <div className="space-y-4">
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
            <Button onClick={addSpecialClosedDay} variant="outline" size="sm">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {formData.special_closed_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_closed_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-red-50">
                  <div>
                    <span className="font-medium text-sm">{day.date}</span>
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

          {formData.special_closed_days.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">特別休業日が登録されていません</p>
          )}
        </div>
      </section>
    </div>
  )
}
