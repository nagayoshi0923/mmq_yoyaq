import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Calendar, Save, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

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

export function PerformanceScheduleSettings() {
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

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .order('name')

      if (storesError) throw storesError

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchSettings(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      alert('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('performance_schedule_settings')
        .select('*')
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
        const { data, error } = await supabase
          .from('performance_schedule_settings')
          .insert({
            store_id: formData.store_id,
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

      alert('保存しました')
    } catch (error) {
      logger.error('保存エラー:', error)
      alert('保存に失敗しました')
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

      {/* 各公演の開始時間 */}
      <Card>
        <CardHeader>
          <CardTitle>公演開始時間</CardTitle>
          <CardDescription>各公演の開始時間を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.performance_times.map((time, index) => (
            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
              <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center">
                {index + 1}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                  <Label>時間帯</Label>
                  <Select
                    value={time.slot}
                    onValueChange={(value) => updatePerformanceTime(index, 'slot', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlotOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>開始時間</Label>
                  <Input
                    type="time"
                    value={time.start_time}
                    onChange={(e) => updatePerformanceTime(index, 'start_time', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* その他の設定 */}
      <Card>
        <CardHeader>
          <CardTitle>その他の設定</CardTitle>
          <CardDescription>準備時間やデフォルト公演時間を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
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
            <div>
              <Label htmlFor="default_duration">デフォルト公演時間（分）</Label>
              <Input
                id="default_duration"
                type="number"
                value={formData.default_duration}
                onChange={(e) => setFormData(prev => ({ ...prev, default_duration: parseInt(e.target.value) || 0 }))}
                min="60"
                max="480"
                step="30"
              />
              <p className="text-xs text-muted-foreground mt-1">
                シナリオ固有の時間が設定されていない場合の標準時間
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

