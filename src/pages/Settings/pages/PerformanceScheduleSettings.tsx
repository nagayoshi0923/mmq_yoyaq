import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, Loader2, Calendar, Clock, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { organizationSettingsApi, type TimeSlotSettings } from '@/lib/api/organizationSettingsApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

const DEFAULT_TIME_SLOT_SETTINGS: TimeSlotSettings = {
  weekday: {
    morning:   { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening:   { start_time: '19:00', end_time: '23:00' }
  },
  holiday: {
    morning:   { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening:   { start_time: '19:00', end_time: '23:00' }
  }
}

interface PerformanceTime { slot: string; start_time: string }
interface PerformanceScheduleData {
  id: string; store_id: string
  performances_per_day: number
  performance_times: PerformanceTime[]
  preparation_time: number
  default_duration: number
}

const timeSlotOptions = [
  { value: 'morning',    label: '午前公演' },
  { value: 'afternoon',  label: '午後公演' },
  { value: 'evening',    label: '夜公演' },
  { value: 'late_night', label: '深夜公演' },
]

interface PerformanceScheduleSettingsProps { storeId?: string }

export function PerformanceScheduleSettings({ storeId }: PerformanceScheduleSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [formData, setFormData] = useState<PerformanceScheduleData>({
    id: '', store_id: '', performances_per_day: 2,
    performance_times: [
      { slot: 'afternoon', start_time: '14:00' },
      { slot: 'evening',   start_time: '18:00' }
    ],
    preparation_time: 30, default_duration: 180
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [timeSlotSettings, setTimeSlotSettings] = useState<TimeSlotSettings>(DEFAULT_TIME_SLOT_SETTINGS)
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false)
  const [isSavingTimeSlots, setIsSavingTimeSlots] = useState(false)

  useEffect(() => {
    fetchData()
    fetchTimeSlotSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const storesData = await storeApi.getAll()
      if (storesData && storesData.length > 0) {
        setStores(storesData)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchTimeSlotSettings = async () => {
    setIsLoadingTimeSlots(true)
    try {
      const settings = await organizationSettingsApi.getTimeSlotSettings()
      setTimeSlotSettings(settings)
    } catch (error) {
      logger.error('時間帯設定取得エラー:', error)
    } finally {
      setIsLoadingTimeSlots(false)
    }
  }

  const updateTimeSlot = (
    dayType: 'weekday' | 'holiday',
    slot: 'morning' | 'afternoon' | 'evening',
    field: 'start_time' | 'end_time',
    value: string
  ) => {
    setTimeSlotSettings(prev => ({
      ...prev,
      [dayType]: { ...prev[dayType], [slot]: { ...prev[dayType][slot], [field]: value } }
    }))
  }

  const handleSaveTimeSlots = async () => {
    setIsSavingTimeSlots(true)
    try {
      await organizationSettingsApi.updateTimeSlotSettings(timeSlotSettings)
      showToast.success('公演時間設定を保存しました')
    } catch (error) {
      logger.error('時間帯設定保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally {
      setIsSavingTimeSlots(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('performance_schedule_settings')
        .select('id, store_id, organization_id, performances_per_day, performance_times, preparation_time, default_duration, updated_at')
        .eq('store_id', storeId).maybeSingle()
      if (error && error.code !== 'PGRST116') throw error
      if (data) {
        setFormData(data)
      } else {
        setFormData({ id: '', store_id: storeId, performances_per_day: 2,
          performance_times: [{ slot: 'afternoon', start_time: '14:00' }, { slot: 'evening', start_time: '18:00' }],
          preparation_time: 30, default_duration: 180 })
      }
    } catch (error) { logger.error('設定取得エラー:', error) }
  }

  const handlePerformancesPerDayChange = (count: number) => {
    const defaultSlots = ['morning', 'afternoon', 'evening', 'late_night']
    const defaultTimes = ['10:00', '14:00', '18:00', '22:00']
    const currentTimes = formData.performance_times
    const newTimes = count > currentTimes.length
      ? [...currentTimes, ...Array.from({ length: count - currentTimes.length }, (_, i) => ({
          slot: defaultSlots[currentTimes.length + i] || `slot${currentTimes.length + i + 1}`,
          start_time: defaultTimes[currentTimes.length + i] || '12:00'
        }))]
      : currentTimes.slice(0, count)
    setFormData(prev => ({ ...prev, performances_per_day: count, performance_times: newTimes }))
  }

  const updatePerformanceTime = (index: number, field: 'slot' | 'start_time', value: string) => {
    setFormData(prev => ({
      ...prev,
      performance_times: prev.performance_times.map((time, i) => i === index ? { ...time, [field]: value } : time)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase.from('performance_schedule_settings')
          .update({ performances_per_day: formData.performances_per_day, performance_times: formData.performance_times,
            preparation_time: formData.preparation_time, default_duration: formData.default_duration })
          .eq('id', formData.id)
        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase.from('performance_schedule_settings')
          .insert({ store_id: formData.store_id, organization_id: store?.organization_id,
            performances_per_day: formData.performances_per_day, performance_times: formData.performance_times,
            preparation_time: formData.preparation_time, default_duration: formData.default_duration })
          .select().single()
        if (error) throw error
        if (data) setFormData(prev => ({ ...prev, id: data.id }))
      }
      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">読み込み中...</div>

  const slotLabels: Record<string, string> = { morning: '朝', afternoon: '昼', evening: '夜' }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader title="公演スケジュール設定" description="イベント作成時のデフォルト公演時間・時間帯設定">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* デフォルト公演時間 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Calendar}
          label="デフォルト公演時間"
          description="スケジュール管理でイベントを新規作成するとき、シナリオ未選択の場合にこの時間（分）で終了時刻が自動計算されます。"
        />
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">デフォルト公演時間</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={formData.default_duration}
              onChange={(e) => setFormData(prev => ({ ...prev, default_duration: parseInt(e.target.value) || 180 }))}
              min="30" max="480" className="w-24"
            />
            <span className="text-sm text-muted-foreground">分</span>
          </div>
          <p className="text-xs text-muted-foreground">例: 180分（3時間）</p>
        </div>
      </section>

      {/* デフォルト公演時間帯（組織共通） */}
      <section className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between mb-4">
          <SectionTitle
            icon={Clock}
            label="デフォルト公演時間帯（組織共通）"
            description="朝・昼・夜公演のデフォルト開始・終了時間を平日と休日で設定します。スケジュール作成時のデフォルト時間枠として使われます。"
          />
          <Button size="sm" variant="outline" onClick={handleSaveTimeSlots} disabled={isSavingTimeSlots}>
            {isSavingTimeSlots ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            保存
          </Button>
        </div>
        {isLoadingTimeSlots ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {(['weekday', 'holiday'] as const).map(dayType => (
              <div key={dayType}>
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {dayType === 'weekday' ? '平日' : '休日・祝日'}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['morning', 'afternoon', 'evening'] as const).map(slot => (
                    <div key={slot} className="space-y-2 p-3 rounded-lg border">
                      <Label className="text-sm font-medium">{slotLabels[slot]}公演</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">開始</Label>
                          <Input type="time" value={timeSlotSettings[dayType][slot].start_time}
                            onChange={(e) => updateTimeSlot(dayType, slot, 'start_time', e.target.value)} className="text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">終了</Label>
                          <Input type="time" value={timeSlotSettings[dayType][slot].end_time}
                            onChange={(e) => updateTimeSlot(dayType, slot, 'end_time', e.target.value)} className="text-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
