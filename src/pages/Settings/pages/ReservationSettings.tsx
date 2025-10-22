import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Ticket, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface ReservationSettings {
  id: string
  store_id: string
  max_participants_per_booking: number
  advance_booking_days: number
  same_day_booking_cutoff: number
  cancellation_policy: string
  cancellation_deadline_hours: number
  max_bookings_per_customer: number | null
  require_phone_verification: boolean
}

export function ReservationSettings() {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<ReservationSettings>({
    id: '',
    store_id: '',
    max_participants_per_booking: 8,
    advance_booking_days: 90,
    same_day_booking_cutoff: 2,
    cancellation_policy: '',
    cancellation_deadline_hours: 24,
    max_bookings_per_customer: null,
    require_phone_verification: false
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
          max_participants_per_booking: 8,
          advance_booking_days: 90,
          same_day_booking_cutoff: 2,
          cancellation_policy: '',
          cancellation_deadline_hours: 24,
          max_bookings_per_customer: null,
          require_phone_verification: false
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
            max_participants_per_booking: formData.max_participants_per_booking,
            advance_booking_days: formData.advance_booking_days,
            same_day_booking_cutoff: formData.same_day_booking_cutoff,
            cancellation_policy: formData.cancellation_policy,
            cancellation_deadline_hours: formData.cancellation_deadline_hours,
            max_bookings_per_customer: formData.max_bookings_per_customer,
            require_phone_verification: formData.require_phone_verification
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('reservation_settings')
          .insert({
            store_id: formData.store_id,
            max_participants_per_booking: formData.max_participants_per_booking,
            advance_booking_days: formData.advance_booking_days,
            same_day_booking_cutoff: formData.same_day_booking_cutoff,
            cancellation_policy: formData.cancellation_policy,
            cancellation_deadline_hours: formData.cancellation_deadline_hours,
            max_bookings_per_customer: formData.max_bookings_per_customer,
            require_phone_verification: formData.require_phone_verification
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData(data)
        }
      }

      alert('設定を保存しました')
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
          <CardDescription>予約の受付開始日と締切を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="advance_booking_days">事前予約可能日数</Label>
              <Input
                id="advance_booking_days"
                type="number"
                value={formData.advance_booking_days}
                onChange={(e) => setFormData(prev => ({ ...prev, advance_booking_days: parseInt(e.target.value) || 0 }))}
                min="1"
                max="365"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.advance_booking_days}日前から予約可能
              </p>
            </div>
            <div>
              <Label htmlFor="same_day_booking_cutoff">当日予約締切（時間前）</Label>
              <Input
                id="same_day_booking_cutoff"
                type="number"
                value={formData.same_day_booking_cutoff}
                onChange={(e) => setFormData(prev => ({ ...prev, same_day_booking_cutoff: parseInt(e.target.value) || 0 }))}
                min="0"
                max="24"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演開始の{formData.same_day_booking_cutoff}時間前まで予約可能
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 人数制限 */}
      <Card>
        <CardHeader>
          <CardTitle>参加人数・予約数制限</CardTitle>
          <CardDescription>1回の予約あたりの最大人数と顧客あたりの予約数を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max_participants_per_booking">1回の予約の最大人数</Label>
              <Input
                id="max_participants_per_booking"
                type="number"
                value={formData.max_participants_per_booking}
                onChange={(e) => setFormData(prev => ({ ...prev, max_participants_per_booking: parseInt(e.target.value) || 0 }))}
                min="1"
                max="50"
              />
            </div>
            <div>
              <Label htmlFor="max_bookings_per_customer">顧客あたりの最大予約数</Label>
              <Input
                id="max_bookings_per_customer"
                type="number"
                value={formData.max_bookings_per_customer || 0}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0
                  setFormData(prev => ({ ...prev, max_bookings_per_customer: value === 0 ? null : value }))
                }}
                min="0"
                max="20"
              />
              <p className="text-xs text-muted-foreground mt-1">
                0 = 制限なし
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* キャンセルポリシー */}
      <Card>
        <CardHeader>
          <CardTitle>キャンセルポリシー</CardTitle>
          <CardDescription>キャンセルの締切と規約を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="cancellation_deadline_hours">キャンセル期限（時間前）</Label>
            <Input
              id="cancellation_deadline_hours"
              type="number"
              value={formData.cancellation_deadline_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_deadline_hours: parseInt(e.target.value) || 0 }))}
              min="0"
              max="720"
            />
            <p className="text-xs text-muted-foreground mt-1">
              公演開始の{formData.cancellation_deadline_hours}時間前までキャンセル可能
            </p>
          </div>
          <div>
            <Label htmlFor="cancellation_policy">キャンセルポリシー</Label>
            <Textarea
              id="cancellation_policy"
              value={formData.cancellation_policy}
              onChange={(e) => setFormData(prev => ({ ...prev, cancellation_policy: e.target.value }))}
              placeholder="キャンセルポリシーを入力"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* 電話番号認証 */}
      <Card>
        <CardHeader>
          <CardTitle>認証設定</CardTitle>
          <CardDescription>予約時の認証要件を設定します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="require_phone_verification">電話番号認証を要求</Label>
              <p className="text-sm text-muted-foreground">予約時に電話番号の認証を必須にします</p>
            </div>
            <Switch
              id="require_phone_verification"
              checked={formData.require_phone_verification}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, require_phone_verification: checked }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}