import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Save, Loader2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { organizationSettingsApi, type TimeSlotSettings } from '@/lib/api/organizationSettingsApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

// デフォルトの公演時間設定（組織共通）
const DEFAULT_TIME_SLOT_SETTINGS: TimeSlotSettings = {
  weekday: {
    morning: { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening: { start_time: '19:00', end_time: '23:00' }
  },
  holiday: {
    morning: { start_time: '10:00', end_time: '14:00' },
    afternoon: { start_time: '14:30', end_time: '18:30' },
    evening: { start_time: '19:00', end_time: '23:00' }
  }
}

interface PerformanceTime {
  slot: string
  start_time: string
}

interface PerformanceScheduleSettings {
  id: string
  store_id: string
  performances_per_day: number
  performance_times: PerformanceTime[]
  preparation_time: number
  default_duration: number
}

const timeSlotOptions = [
  { value: 'morning', label: '午前公演' },
  { value: 'afternoon', label: '午後公演' },
  { value: 'evening', label: '夜公演' },
  { value: 'late_night', label: '深夜公演' }
]

interface PerformanceScheduleSettingsProps {
  storeId?: string
}

export function PerformanceScheduleSettings({ storeId }: PerformanceScheduleSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<PerformanceScheduleSettings>({
    id: '',
    store_id: '',
    performances_per_day: 2,
    performance_times: [
      { slot: 'afternoon', start_time: '14:00' },
      { slot: 'evening', start_time: '18:00' }
    ],
    preparation_time: 30,
    default_duration: 180
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 平日/休日の公演時間設定（組織共通）
  const [timeSlotSettings, setTimeSlotSettings] = useState<TimeSlotSettings>(DEFAULT_TIME_SLOT_SETTINGS)
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false)
  const [isSavingTimeSlots, setIsSavingTimeSlots] = useState(false)

  useEffect(() => {
    fetchData()
    fetchTimeSlotSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- マウント時のみ実行
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 組織対応済みの店舗取得
      const storesData = await storeApi.getAll()

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 平日/休日の公演時間設定を読み込み
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

  // 平日/休日の公演時間設定を更新
  const updateTimeSlot = (
    dayType: 'weekday' | 'holiday',
    slot: 'morning' | 'afternoon' | 'evening',
    field: 'start_time' | 'end_time',
    value: string
  ) => {
    setTimeSlotSettings(prev => ({
      ...prev,
      [dayType]: {
        ...prev[dayType],
        [slot]: {
          ...prev[dayType][slot],
          [field]: value
        }
      }
    }))
  }

  // 平日/休日の公演時間設定を保存
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
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData(data)
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          performances_per_day: 2,
          performance_times: [
            { slot: 'afternoon', start_time: '14:00' },
            { slot: 'evening', start_time: '18:00' }
          ],
          preparation_time: 30,
          default_duration: 180
        })
      }
    } catch (error) {
      logger.error('設定取得エラー:', error)
    }
  }

  const handleStoreChange = async (storeId: string) => {
    setSelectedStoreId(storeId)
    await fetchSettings(storeId)
  }

  const handlePerformancesPerDayChange = (count: number) => {
    const currentTimes = formData.performance_times
    let newTimes: PerformanceTime[] = []

    if (count > currentTimes.length) {
      // 公演を追加
      newTimes = [...currentTimes]
      const defaultSlots = ['morning', 'afternoon', 'evening', 'late_night']
      const defaultTimes = ['10:00', '14:00', '18:00', '22:00']
      
      for (let i = currentTimes.length; i < count; i++) {
        newTimes.push({
          slot: defaultSlots[i] || `slot${i + 1}`,
          start_time: defaultTimes[i] || '12:00'
        })
      }
    } else {
      // 公演を削除
      newTimes = currentTimes.slice(0, count)
    }

    setFormData(prev => ({
      ...prev,
      performances_per_day: count,
      performance_times: newTimes
    }))
  }

  const updatePerformanceTime = (index: number, field: 'slot' | 'start_time', value: string) => {
    setFormData(prev => ({
      ...prev,
      performance_times: prev.performance_times.map((time, i) =>
        i === index ? { ...time, [field]: value } : time
      )
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('performance_schedule_settings')
          .update({
            performances_per_day: formData.performances_per_day,
            performance_times: formData.performance_times,
            preparation_time: formData.preparation_time,
            default_duration: formData.default_duration
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('performance_schedule_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            performances_per_day: formData.performances_per_day,
            performance_times: formData.performance_times,
            preparation_time: formData.preparation_time,
            default_duration: formData.default_duration
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(prev => ({ ...prev, id: data.id }))
        }
      }

      showToast.success('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      showToast.error('保存に失敗しました')
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
        title="公演スケジュール設定"
        description="スケジュール表示と運用設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 公演回数 */}
      <Card>
        <CardHeader>
          <CardTitle>1日の公演回数</CardTitle>
          <CardDescription>1日に何回公演を行うかを設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Label className="w-32">公演回数</Label>
            <Select 
              value={formData.performances_per_day.toString()} 
              onValueChange={(value) => handlePerformancesPerDayChange(parseInt(value))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1回</SelectItem>
                <SelectItem value="2">2回</SelectItem>
                <SelectItem value="3">3回</SelectItem>
                <SelectItem value="4">4回</SelectItem>
                <SelectItem value="5">5回</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* その他の設定 */}
      <Card>
        <CardHeader>
          <CardTitle>その他の設定</CardTitle>
          <CardDescription>公演間の準備時間を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Label htmlFor="preparation_time">公演間の準備時間（分）</Label>
            <Input
              id="preparation_time"
              type="number"
              value={formData.preparation_time}
              onChange={(e) => setFormData(prev => ({ ...prev, preparation_time: parseInt(e.target.value) || 0 }))}
              min="0"
              max="120"
            />
            <p className="text-xs text-muted-foreground mt-1">
              公演と公演の間に必要な準備・片付け時間
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 平日/休日の公演時間設定（組織共通） */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            デフォルト公演時間（平日/休日）
          </CardTitle>
          <CardDescription>
            朝・昼・夜公演のデフォルト開始・終了時間を設定します。平日と休日・祝日で別々に設定できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTimeSlots ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* 平日設定 */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">平日</h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(['morning', 'afternoon', 'evening'] as const).map(slot => (
                    <div key={slot} className="space-y-2 p-3 border rounded-lg">
                      <Label className="text-sm font-medium">
                        {slot === 'morning' ? '朝公演' : slot === 'afternoon' ? '昼公演' : '夜公演'}
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">開始</Label>
                          <Input
                            type="time"
                            value={timeSlotSettings.weekday[slot].start_time}
                            onChange={(e) => updateTimeSlot('weekday', slot, 'start_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">終了</Label>
                          <Input
                            type="time"
                            value={timeSlotSettings.weekday[slot].end_time}
                            onChange={(e) => updateTimeSlot('weekday', slot, 'end_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 休日・祝日設定 */}
              <div>
                <h4 className="font-medium mb-3 text-sm text-muted-foreground">休日・祝日</h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(['morning', 'afternoon', 'evening'] as const).map(slot => (
                    <div key={slot} className="space-y-2 p-3 border rounded-lg">
                      <Label className="text-sm font-medium">
                        {slot === 'morning' ? '朝公演' : slot === 'afternoon' ? '昼公演' : '夜公演'}
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">開始</Label>
                          <Input
                            type="time"
                            value={timeSlotSettings.holiday[slot].start_time}
                            onChange={(e) => updateTimeSlot('holiday', slot, 'start_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">終了</Label>
                          <Input
                            type="time"
                            value={timeSlotSettings.holiday[slot].end_time}
                            onChange={(e) => updateTimeSlot('holiday', slot, 'end_time', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveTimeSlots} disabled={isSavingTimeSlots}>
                  {isSavingTimeSlots && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" />
                  時間設定を保存
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

