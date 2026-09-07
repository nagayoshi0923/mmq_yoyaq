import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'
import { getSafeErrorMessage } from '@/lib/apiErrorHandler'
import { getCurrentOrganizationId } from '@/lib/organization'
import {
  WEEKDAYS,
  SLOT_OPTIONS,
  defaultSlotTimes,
  weekdaySlotTimes,
  defaultWeekdayHours,
  getDefaultOpeningHours,
  mergeWithDefaults,
  type OpeningHours,
  type DayHours,
  type SpecialDay,
} from '@/lib/storeBusinessHours'

export type StoreHoursHandle = {
  save: () => Promise<boolean>
}

interface StoreHoursSectionProps {
  storeId?: string
}

export const StoreHoursSection = forwardRef<StoreHoursHandle, StoreHoursSectionProps>(function StoreHoursSection(
  { storeId },
  ref
) {
  const [openingHours, setOpeningHours] = useState<OpeningHours>(getDefaultOpeningHours())
  const [specialOpenDays, setSpecialOpenDays] = useState<SpecialDay[]>([])
  const [newOpenDay, setNewOpenDay] = useState({ date: '', note: '' })
  const [loading, setLoading] = useState(false)
  const [rowId, setRowId] = useState('')

  useEffect(() => {
    if (!storeId) {
      setOpeningHours(getDefaultOpeningHours())
      setSpecialOpenDays([])
      setRowId('')
      return
    }
    void load(storeId)
  }, [storeId])

  const load = async (targetStoreId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('business_hours_settings')
        .select('id, store_id, opening_hours, special_open_days')
        .eq('store_id', targetStoreId)
        .maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      if (data) {
        setRowId(data.id)
        setOpeningHours(mergeWithDefaults(data.opening_hours))
        setSpecialOpenDays((data.special_open_days || []) as SpecialDay[])
      } else {
        setRowId('')
        setOpeningHours(getDefaultOpeningHours())
        setSpecialOpenDays([])
      }
    } catch (error) {
      logger.error('営業時間の取得に失敗:', error)
      showToast.error('営業時間の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const updateDayHours = (day: keyof OpeningHours, field: keyof DayHours, value: string | boolean | string[]) => {
    setOpeningHours(prev => ({
      ...prev,
      [day]: {
        ...(prev[day] || defaultWeekdayHours),
        [field]: value,
      },
    }))
  }

  const toggleSlot = (day: keyof OpeningHours, slot: 'morning' | 'afternoon' | 'evening') => {
    const currentSlots = openingHours[day]?.available_slots || []
    const newSlots = currentSlots.includes(slot)
      ? currentSlots.filter(s => s !== slot)
      : [...currentSlots, slot]
    updateDayHours(day, 'available_slots', newSlots)
  }

  const updateSlotStartTime = (day: keyof OpeningHours, slot: 'morning' | 'afternoon' | 'evening', time: string) => {
    const isWeekend = day === 'saturday' || day === 'sunday'
    const currentTimes = openingHours[day]?.slot_start_times || (isWeekend ? defaultSlotTimes : weekdaySlotTimes)
    setOpeningHours(prev => ({
      ...prev,
      [day]: {
        ...(prev[day] || defaultWeekdayHours),
        slot_start_times: {
          ...currentTimes,
          [slot]: time,
        },
      },
    }))
  }

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!storeId) return true
      try {
        const orgId = await getCurrentOrganizationId()
        const openingHoursToSave = mergeWithDefaults(openingHours)
        const { data: updated, error: updateError } = await supabase
          .from('business_hours_settings')
          .update({
            opening_hours: openingHoursToSave,
            special_open_days: specialOpenDays,
          })
          .eq('store_id', storeId)
          .select('id')
        if (updateError) throw updateError
        if (updated && updated.length > 0) {
          setRowId(updated[0].id)
        } else {
          const { data, error } = await supabase
            .from('business_hours_settings')
            .insert({
              store_id: storeId,
              organization_id: orgId,
              opening_hours: openingHoursToSave,
              special_open_days: specialOpenDays,
            })
            .select('id')
            .maybeSingle()
          if (error) throw error
          if (data?.id) setRowId(data.id)
        }
        return true
      } catch (error) {
        logger.error('営業時間の保存に失敗:', error)
        showToast.error(getSafeErrorMessage(error, '営業時間の保存に失敗しました'))
        return false
      }
    },
  }))

  if (!storeId) {
    return (
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__note">店舗を作成したあと、営業時間を設定できます。</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__note">読み込み中...</p>
      </div>
    )
  }

  return (
    <>
      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">曜日ごとの公演枠</p>
        <p className="scenario-edit-card__note">
          有効にした枠だけ予約カレンダーと貸切に出ます。平日は昼・夜だけ、など曜日ごとに変えられます。
        </p>
        <div className="space-y-3">
          {WEEKDAYS.map(day => {
            const dayHours = openingHours[day.value] || defaultWeekdayHours
            const isWeekend = day.value === 'saturday' || day.value === 'sunday'
            const availableSlots = dayHours.available_slots || (isWeekend ? ['morning', 'afternoon', 'evening'] : ['afternoon', 'evening'])
            return (
              <div key={day.value} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="scenario-edit-card__sublabel w-8">{day.short}</span>
                  <Switch
                    checked={dayHours.is_open}
                    onCheckedChange={(checked) => updateDayHours(day.value, 'is_open', checked)}
                  />
                  <span className="scenario-edit-card__note">
                    {dayHours.is_open ? '営業' : '休業'}
                  </span>
                  {dayHours.is_open && (
                    <div className="flex flex-wrap gap-2">
                      {SLOT_OPTIONS.map(slot => {
                        const isActive = availableSlots.includes(slot.value)
                        const slotTimes = dayHours.slot_start_times || (isWeekend ? defaultSlotTimes : weekdaySlotTimes)
                        const startTime = slotTimes[slot.value] || slot.defaultTime
                        return (
                          <div key={slot.value} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleSlot(day.value, slot.value)}
                              className={isActive ? 'scenario-edit-dialog__btn-primary' : 'scenario-edit-dialog__btn'}
                            >
                              {slot.label}
                            </button>
                            {isActive && (
                              <Input
                                type="time"
                                value={startTime}
                                onChange={(e) => updateSlotStartTime(day.value, slot.value, e.target.value)}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="scenario-edit-card">
        <p className="scenario-edit-card__title">特別営業日</p>
        <p className="scenario-edit-card__note">
          平日でも土日と同じ枠（朝を含む）にする日です。祝日・お盆など。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
          <div>
            <Label htmlFor="special-open-date">日付</Label>
            <Input
              id="special-open-date"
              type="date"
              value={newOpenDay.date}
              onChange={(e) => setNewOpenDay(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="special-open-note">備考</Label>
            <Input
              id="special-open-note"
              value={newOpenDay.note}
              onChange={(e) => setNewOpenDay(prev => ({ ...prev, note: e.target.value }))}
              placeholder="例: 成人の日"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!newOpenDay.date) {
                  showToast.warning('日付を入力してください')
                  return
                }
                setSpecialOpenDays(prev => [...prev, { ...newOpenDay }])
                setNewOpenDay({ date: '', note: '' })
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {specialOpenDays.length === 0 ? (
          <p className="scenario-edit-card__note">特別営業日はまだありません</p>
        ) : (
          <ul className="space-y-2">
            {specialOpenDays.map((day, index) => (
              <li key={`${day.date}-${index}`} className="flex items-center justify-between gap-2">
                <span className="scenario-edit-card__note">
                  {day.date}{day.note ? ` — ${day.note}` : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSpecialOpenDays(prev => prev.filter((_, i) => i !== index))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
})
