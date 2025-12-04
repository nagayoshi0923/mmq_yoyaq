import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Clock, Save, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface BusinessHoursSettings {
  id: string
  store_id: string
  business_start_time: string
  business_end_time: string
  regular_holidays: string[] // ['monday', 'tuesday', etc.]
  special_open_days: { date: string; note: string }[]
  special_closed_days: { date: string; note: string }[]
}

const weekdays = [
  { value: 'monday', label: '月曜日' },
  { value: 'tuesday', label: '火曜日' },
  { value: 'wednesday', label: '水曜日' },
  { value: 'thursday', label: '木曜日' },
  { value: 'friday', label: '金曜日' },
  { value: 'saturday', label: '土曜日' },
  { value: 'sunday', label: '日曜日' }
]

export function BusinessHoursSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<BusinessHoursSettings>({
    id: '',
    store_id: '',
    business_start_time: '10:00',
    business_end_time: '22:00',
    regular_holidays: [],
    special_open_days: [],
    special_closed_days: []
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newOpenDay, setNewOpenDay] = useState({ date: '', note: '' })
  const [newClosedDay, setNewClosedDay] = useState({ date: '', note: '' })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 店舗データを取得
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .order('name')

      if (storesError) throw storesError

      if (storesData && storesData.length > 0) {
        setStores(storesData)
        setSelectedStoreId(storesData[0].id)
        await fetchBusinessHours(storesData[0].id)
      }
    } catch (error) {
      logger.error('データ取得エラー:', error)
      showToast.error('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const fetchBusinessHours = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('business_hours_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData(data)
      } else {
        // データが存在しない場合はデフォルト値
        setFormData({
          id: '',
          store_id: storeId,
          business_start_time: '10:00',
          business_end_time: '22:00',
          regular_holidays: [],
          special_open_days: [],
          special_closed_days: []
        })
      }
    } catch (error) {
      logger.error('営業時間取得エラー:', error)
    }
  }

  const handleStoreChange = async (storeId: string) => {
    setSelectedStoreId(storeId)
    await fetchBusinessHours(storeId)
  }

  const toggleHoliday = (day: string) => {
    setFormData(prev => ({
      ...prev,
      regular_holidays: prev.regular_holidays.includes(day)
        ? prev.regular_holidays.filter(d => d !== day)
        : [...prev.regular_holidays, day]
    }))
  }

  const addSpecialOpenDay = () => {
    if (!newOpenDay.date) {
      alert('日付を入力してください')
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
      alert('日付を入力してください')
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

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        // 既存データを更新
        const { error } = await supabase
          .from('business_hours_settings')
          .update({
            business_start_time: formData.business_start_time,
            business_end_time: formData.business_end_time,
            regular_holidays: formData.regular_holidays,
            special_open_days: formData.special_open_days,
            special_closed_days: formData.special_closed_days
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        // 新規作成
        const { data, error } = await supabase
          .from('business_hours_settings')
          .insert({
            store_id: formData.store_id,
            business_start_time: formData.business_start_time,
            business_end_time: formData.business_end_time,
            regular_holidays: formData.regular_holidays,
            special_open_days: formData.special_open_days,
            special_closed_days: formData.special_closed_days
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
        title="営業時間設定"
        description="店舗の営業時間と定休日設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 基本営業時間 */}
      <Card>
        <CardHeader>
          <CardTitle>基本営業時間</CardTitle>
          <CardDescription>通常の営業開始・終了時間を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start_time">営業開始時間</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.business_start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, business_start_time: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="end_time">営業終了時間</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.business_end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, business_end_time: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 定休日 */}
      <Card>
        <CardHeader>
          <CardTitle>定休日</CardTitle>
          <CardDescription>定期的にお休みする曜日を選択してください</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {weekdays.map(day => (
              <div key={day.value} className="flex items-center space-x-2">
                <Checkbox
                  id={day.value}
                  checked={formData.regular_holidays.includes(day.value)}
                  onCheckedChange={() => toggleHoliday(day.value)}
                />
                <label
                  htmlFor={day.value}
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {day.label}
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 特別営業日 */}
      <Card>
        <CardHeader>
          <CardTitle>特別営業日</CardTitle>
          <CardDescription>定休日でも営業する日を設定します</CardDescription>
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
              placeholder="備考（オプション）"
            />
            <Button onClick={addSpecialOpenDay} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.special_open_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_open_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="">{day.date}</span>
                    {day.note && <span className="text-xs text-muted-foreground ml-2">- {day.note}</span>}
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
          <CardDescription>営業日でもお休みする日を設定します</CardDescription>
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
              placeholder="備考（オプション）"
            />
            <Button onClick={addSpecialClosedDay} variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formData.special_closed_days.length > 0 && (
            <div className="space-y-2">
              {formData.special_closed_days.map((day, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <span className="">{day.date}</span>
                    {day.note && <span className="text-xs text-muted-foreground ml-2">- {day.note}</span>}
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

