import { PageHeader } from "@/components/layout/PageHeader"
import { SectionTitle } from '@/components/settings/SectionTitle'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { OperatingScalarSettings } from '@/components/settings/OperatingScalarSettings'
import { Save, Loader2, Clock } from 'lucide-react'
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

interface PerformanceScheduleSettingsProps { storeId?: string; scope?: 'organization' | 'store' }

export function PerformanceScheduleSettings({ storeId, scope = 'store' }: PerformanceScheduleSettingsProps) {
  const [settingsLoadError, setSettingsLoadError] = useState(false)
  const [timeSlotSettings, setTimeSlotSettings] = useState<TimeSlotSettings>(DEFAULT_TIME_SLOT_SETTINGS)
  const [isLoadingTimeSlots, setIsLoadingTimeSlots] = useState(false)
  const [isSavingTimeSlots, setIsSavingTimeSlots] = useState(false)

  useEffect(() => {
    if (scope === 'organization') void fetchTimeSlotSettings()
  }, [scope])

  const fetchTimeSlotSettings = async () => {
    setIsLoadingTimeSlots(true)
    try {
      const settings = await organizationSettingsApi.getTimeSlotSettings()
      setTimeSlotSettings(settings)
    } catch (error) {
      setSettingsLoadError(true)
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

  if (settingsLoadError) return <p role="alert">設定を取得できませんでした。ページを再読み込みしてください。</p>


  const slotLabels: Record<string, string> = { morning: '朝', afternoon: '昼', evening: '夜' }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <PageHeader title={scope === 'organization' ? '公演の時間帯（組織共通）' : '標準の公演時間（店舗別）'} description="公演を作成するときの初期値を設定します" />
      <p className="text-sm text-muted-foreground">作品を選ぶと作品の公演時間を優先します。作品未選択時は、店舗の個別指定、組織共通の順で適用します。作成済みの公演時間は変更しません。</p>
      <OperatingScalarSettings scope={scope} targetId={storeId} keys={['default_performance_duration']} title="作品未選択時の公演時間" />
      {scope === 'organization' && <>
      <section className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between mb-4">
          <SectionTitle
            icon={Clock}
            label="デフォルト公演時間帯（組織共通）"
            description="朝・昼・夜公演のデフォルト開始・終了時間を平日と休日で設定します。スケジュール作成時のデフォルト時間枠として使われます。"
          />
          <Button size="sm" variant="outline" onClick={handleSaveTimeSlots} disabled={isSavingTimeSlots || isLoadingTimeSlots}>
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
      </>}
    </div>
  )
}
