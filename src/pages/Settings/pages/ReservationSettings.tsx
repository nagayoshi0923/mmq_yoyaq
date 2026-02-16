import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/layout/PageHeader'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { storeApi } from '@/lib/api/storeApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface ReservationSettings {
  id: string
  store_id: string
  max_participants_per_booking: number
  advance_booking_days: number
  same_day_booking_cutoff: number
  private_booking_deadline_days: number
  max_bookings_per_customer: number | null
  require_phone_verification: boolean
}

interface ReservationSettingsProps {
  storeId?: string
}

export function ReservationSettings({ storeId }: ReservationSettingsProps) {
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [formData, setFormData] = useState<ReservationSettings>({
    id: '',
    store_id: '',
    max_participants_per_booking: 8,
    advance_booking_days: 90,
    same_day_booking_cutoff: 0,
    private_booking_deadline_days: 7,
    max_bookings_per_customer: null,
    require_phone_verification: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
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

  const fetchSettings = async (storeId: string) => {
    try {
      const { data, error } = await supabase
        .from('reservation_settings')
        .select('id, store_id, organization_id, max_participants_per_booking, advance_booking_days, same_day_booking_cutoff, private_booking_deadline_days, max_bookings_per_customer, require_phone_verification, updated_at')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') throw error

      if (data) {
        setFormData({
          id: data.id,
          store_id: data.store_id,
          max_participants_per_booking: data.max_participants_per_booking ?? 8,
          advance_booking_days: data.advance_booking_days ?? 90,
          same_day_booking_cutoff: data.same_day_booking_cutoff ?? 0,
          private_booking_deadline_days: data.private_booking_deadline_days ?? 7,
          max_bookings_per_customer: data.max_bookings_per_customer,
          require_phone_verification: data.require_phone_verification ?? false
        })
      } else {
        setFormData({
          id: '',
          store_id: storeId,
          max_participants_per_booking: 8,
          advance_booking_days: 90,
          same_day_booking_cutoff: 0,
          private_booking_deadline_days: 7,
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
            private_booking_deadline_days: formData.private_booking_deadline_days,
            max_bookings_per_customer: formData.max_bookings_per_customer,
            require_phone_verification: formData.require_phone_verification
          })
          .eq('id', formData.id)

        if (error) throw error
      } else {
        const store = stores.find(s => s.id === formData.store_id)
        const { data, error } = await supabase
          .from('reservation_settings')
          .insert({
            store_id: formData.store_id,
            organization_id: store?.organization_id,
            max_participants_per_booking: formData.max_participants_per_booking,
            advance_booking_days: formData.advance_booking_days,
            same_day_booking_cutoff: formData.same_day_booking_cutoff,
            private_booking_deadline_days: formData.private_booking_deadline_days,
            max_bookings_per_customer: formData.max_bookings_per_customer,
            require_phone_verification: formData.require_phone_verification
          })
          .select()
          .single()

        if (error) throw error
        if (data) {
          setFormData({
            id: data.id,
            store_id: data.store_id,
            max_participants_per_booking: data.max_participants_per_booking ?? 8,
            advance_booking_days: data.advance_booking_days ?? 90,
            same_day_booking_cutoff: data.same_day_booking_cutoff ?? 0,
            private_booking_deadline_days: data.private_booking_deadline_days ?? 7,
            max_bookings_per_customer: data.max_bookings_per_customer,
            require_phone_verification: data.require_phone_verification ?? false
          })
        }
      }

      showToast.success('設定を保存しました')
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
        title="予約設定"
        description="予約の受付期間、人数制限、認証設定"
      >
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

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
                {formData.same_day_booking_cutoff === 0
                  ? '公演開始まで予約可能'
                  : `公演開始の${formData.same_day_booking_cutoff}時間前まで予約可能`}
              </p>
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <div>
              <Label htmlFor="private_booking_deadline_days">貸切予約の受付締切（日前）</Label>
              <Input
                id="private_booking_deadline_days"
                type="number"
                value={formData.private_booking_deadline_days}
                onChange={(e) => setFormData(prev => ({ ...prev, private_booking_deadline_days: parseInt(e.target.value) || 0 }))}
                min="0"
                max="90"
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                公演日の{formData.private_booking_deadline_days}日前まで貸切申込を受付
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
              <p className="text-xs text-muted-foreground">予約時に電話番号の認証を必須にします</p>
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