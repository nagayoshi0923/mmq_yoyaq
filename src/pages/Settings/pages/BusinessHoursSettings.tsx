import { PageHeader } from "@/components/layout/PageHeader"
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Plus, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface DayHours {
  is_open: boolean
  open_time: string
  close_time: string
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

// デフォルトの営業時間設定
const defaultWeekdayHours: DayHours = { is_open: true, open_time: '13:00', close_time: '23:00' }
const defaultWeekendHours: DayHours = { is_open: true, open_time: '09:00', close_time: '23:00' }

const getDefaultOpeningHours = (): OpeningHours => ({
  monday: { ...defaultWeekdayHours },
  tuesday: { ...defaultWeekdayHours },
  wednesday: { ...defaultWeekdayHours },
  thursday: { ...defaultWeekdayHours },
  friday: { ...defaultWeekdayHours },
  saturday: { ...defaultWeekendHours },
  sunday: { ...defaultWeekendHours }
})

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
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // 店舗データを取得
      const { data: storesData, error: storesError } = await supabase
        .from('stores')
        .select('*')
        .neq('ownership_type', 'office')
        .order('display_order', { ascending: true, nullsFirst: false })

      if (storesError) throw storesError

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
      const { data, error } = await supabase
        .from('business_hours_settings')
        .select('*')
        .eq('store_id', targetStoreId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData({
          ...data,
          opening_hours: data.opening_hours || getDefaultOpeningHours(),
          holidays: data.holidays || [],
          special_open_days: data.special_open_days || [],
          special_closed_days: data.special_closed_days || []
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

  const updateDayHours = (day: keyof OpeningHours, field: keyof DayHours, value: string | boolean) => {
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

  const handleSave = async () => {
    setSaving(true)
    try {
      const store = stores.find(s => s.id === selectedStoreId)
      const saveData = {
        store_id: selectedStoreId,
        organization_id: store?.organization_id,
        opening_hours: formData.opening_hours,
        holidays: formData.holidays,
        special_open_days: formData.special_open_days,
        special_closed_days: formData.special_closed_days
      }

      if (formData.id) {
        // 既存データを更新
        const { error } = await supabase
          .from('business_hours_settings')
          .update(saveData)
          .eq('id', formData.id)

        if (error) throw error
      } else {
        // 新規作成
        const { data, error } = await supabase
          .from('business_hours_settings')
          .insert(saveData)
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
        description="店舗ごとの曜日別営業時間と特別営業日を設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 店舗選択 */}
      {stores.length > 1 && (
        <Card>
          <CardContent className="pt-4">
            <Label htmlFor="store-select">店舗を選択</Label>
            <select
              id="store-select"
              className="w-full mt-1 p-2 border rounded-md"
              value={selectedStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
            >
              {stores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.short_name || store.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

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
            
            return (
              <div 
                key={day.value} 
                className={`flex items-center gap-4 p-3 rounded-lg ${isWeekend ? 'bg-blue-50' : 'bg-gray-50'}`}
              >
                <div className="w-16 font-medium">
                  <span className={isWeekend ? 'text-blue-600' : ''}>{day.short}</span>
                </div>
                
                <Switch
                  checked={dayHours.is_open}
                  onCheckedChange={(checked) => updateDayHours(day.value as keyof OpeningHours, 'is_open', checked)}
                />
                
                <span className={`text-sm ${dayHours.is_open ? '' : 'text-muted-foreground'}`}>
                  {dayHours.is_open ? '営業' : '休業'}
                </span>
                
                {dayHours.is_open && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Input
                      type="time"
                      value={dayHours.open_time}
                      onChange={(e) => updateDayHours(day.value as keyof OpeningHours, 'open_time', e.target.value)}
                      className="w-28"
                    />
                    <span>〜</span>
                    <Input
                      type="time"
                      value={dayHours.close_time}
                      onChange={(e) => updateDayHours(day.value as keyof OpeningHours, 'close_time', e.target.value)}
                      className="w-28"
                    />
                  </div>
                )}
              </div>
            )
          })}
          
          <div className="text-sm text-muted-foreground mt-4 p-3 bg-amber-50 rounded-lg">
            <p className="font-medium text-amber-800">💡 営業時間と貸切リクエストの関係</p>
            <ul className="mt-2 space-y-1 text-amber-700">
              <li>• 営業時間外の公演枠は貸切リクエストで選択不可になります</li>
              <li>• 例：平日13:00〜なら朝公演（10:00開始）は受付不可</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 特別営業日（祝日など） */}
      <Card>
        <CardHeader>
          <CardTitle>特別営業日</CardTitle>
          <CardDescription>定休日でも営業する日（祝日、年末年始、お盆など）</CardDescription>
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
