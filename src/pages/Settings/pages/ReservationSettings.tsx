import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Ticket, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface ReservationSettings {
  id: string
  store_id: string
  booking_start_days: number
  booking_deadline_days: number
  cancellation_deadline_days: number
  min_participants: number
  max_participants: number
  max_simultaneous_bookings: number
}

export function ReservationSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<ReservationSettings>({
    id: '',
    store_id: '',
    booking_start_days: 30,
    booking_deadline_days: 1,
    cancellation_deadline_days: 3,
    min_participants: 4,
    max_participants: 8,
    max_simultaneous_bookings: 3
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
        .from('reservation_settings')
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
          booking_start_days: 30,
          booking_deadline_days: 1,
          cancellation_deadline_days: 3,
          min_participants: 4,
          max_participants: 8,
          max_simultaneous_bookings: 3
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

  const handleSave = async () => {
    setSaving(true)
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('reservation_settings')
          .update({
            booking_start_days: formData.booking_start_days,
            booking_deadline_days: formData.booking_deadline_days,
            cancellation_deadline_days: formData.cancellation_deadline_days,
            min_participants: formData.min_participants,
            max_participants: formData.max_participants,
            max_simultaneous_bookings: formData.max_simultaneous_bookings
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('reservation_settings')
          .insert({
            store_id: formData.store_id,
            booking_start_days: formData.booking_start_days,
            booking_deadline_days: formData.booking_deadline_days,
            cancellation_deadline_days: formData.cancellation_deadline_days,
            min_participants: formData.min_participants,
            max_participants: formData.max_participants,
            max_simultaneous_bookings: formData.max_simultaneous_bookings
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Ticket className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">予約設定</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>

      {/* 予約期間設定 */}
      <Card>
        <CardHeader>
          <CardTitle>予約受付期間</CardTitle>
          <CardDescription>予約の受付開始日と締切日を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="booking_start_days">予約開始（日前）</Label>
              <Input
                id="booking_start_days"
                type="number"
                value={formData.booking_start_days}
                onChange={(e) => setFormData(prev => ({ ...prev, booking_start_days: parseInt(e.target.value) || 0 }))}
                min="1"
                max="365"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演日の{formData.booking_start_days}日前から予約開始
              </p>
            </div>
            <div>
              <Label htmlFor="booking_deadline_days">予約締切（日前）</Label>
              <Input
                id="booking_deadline_days"
                type="number"
                value={formData.booking_deadline_days}
                onChange={(e) => setFormData(prev => ({ ...prev, booking_deadline_days: parseInt(e.target.value) || 0 }))}
                min="0"
                max="30"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演日の{formData.booking_deadline_days}日前まで予約可能
              </p>
            </div>
            <div>
              <Label htmlFor="cancellation_deadline_days">キャンセル期限（日前）</Label>
              <Input
                id="cancellation_deadline_days"
                type="number"
                value={formData.cancellation_deadline_days}
                onChange={(e) => setFormData(prev => ({ ...prev, cancellation_deadline_days: parseInt(e.target.value) || 0 }))}
                min="0"
                max="30"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演日の{formData.cancellation_deadline_days}日前までキャンセル可能
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 人数制限 */}
      <Card>
        <CardHeader>
          <CardTitle>参加人数制限</CardTitle>
          <CardDescription>最小・最大参加人数を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="min_participants">最小参加人数</Label>
              <Input
                id="min_participants"
                type="number"
                value={formData.min_participants}
                onChange={(e) => setFormData(prev => ({ ...prev, min_participants: parseInt(e.target.value) || 0 }))}
                min="1"
                max="20"
              />
            </div>
            <div>
              <Label htmlFor="max_participants">最大参加人数</Label>
              <Input
                id="max_participants"
                type="number"
                value={formData.max_participants}
                onChange={(e) => setFormData(prev => ({ ...prev, max_participants: parseInt(e.target.value) || 0 }))}
                min="1"
                max="50"
              />
            </div>
            <div>
              <Label htmlFor="max_simultaneous_bookings">同時予約可能数</Label>
              <Input
                id="max_simultaneous_bookings"
                type="number"
                value={formData.max_simultaneous_bookings}
                onChange={(e) => setFormData(prev => ({ ...prev, max_simultaneous_bookings: parseInt(e.target.value) || 0 }))}
                min="1"
                max="10"
              />
              <p className="text-xs text-muted-foreground mt-1">
                1人のユーザーが同時に予約できる公演数
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

