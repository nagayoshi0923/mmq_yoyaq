import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PageHeader } from '@/components/layout/PageHeader'
import { SectionTitle } from '@/components/settings/SectionTitle'
import { Save, CalendarDays, Users, ShieldCheck } from 'lucide-react'
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
  payment_method_label: string
  payment_method_description: string
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
    require_phone_verification: false,
    payment_method_label: '現地決済',
    payment_method_description: 'ご来店時にお支払いください'
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
        .select('id, store_id, organization_id, max_participants_per_booking, advance_booking_days, same_day_booking_cutoff, private_booking_deadline_days, max_bookings_per_customer, require_phone_verification, payment_method_label, payment_method_description, updated_at')
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
          require_phone_verification: data.require_phone_verification ?? false,
          payment_method_label: data.payment_method_label ?? '現地決済',
          payment_method_description: data.payment_method_description ?? 'ご来店時にお支払いください'
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
          require_phone_verification: false,
          payment_method_label: '現地決済',
          payment_method_description: 'ご来店時にお支払いください'
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
            require_phone_verification: formData.require_phone_verification,
            payment_method_label: formData.payment_method_label,
            payment_method_description: formData.payment_method_description
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
            require_phone_verification: formData.require_phone_verification,
            payment_method_label: formData.payment_method_label,
            payment_method_description: formData.payment_method_description
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
            require_phone_verification: data.require_phone_verification ?? false,
            payment_method_label: data.payment_method_label ?? '現地決済',
            payment_method_description: data.payment_method_description ?? 'ご来店時にお支払いください'
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="予約設定"
        description="予約の受付期間・人数制限・認証・支払い方法を店舗ごとに設定します"
      >
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {saving ? '保存中...' : '保存'}
        </Button>
      </PageHeader>

      {/* 予約受付期間 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={CalendarDays}
          label="予約受付期間"
          description="何日前から予約を受け付けるか、公演直前の締切をいつにするかを設定します。予約サイトのカレンダー表示に反映されます"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">事前予約可能日数</Label>
              <Input
                type="number"
                value={formData.advance_booking_days}
                onChange={(e) => setFormData(prev => ({ ...prev, advance_booking_days: parseInt(e.target.value) || 0 }))}
                min="1"
                max="365"
              />
              <p className="text-xs text-muted-foreground">
                {formData.advance_booking_days}日前から予約可能
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">当日予約締切（時間前）</Label>
              <Input
                type="number"
                value={formData.same_day_booking_cutoff}
                onChange={(e) => setFormData(prev => ({ ...prev, same_day_booking_cutoff: parseInt(e.target.value) || 0 }))}
                min="0"
                max="24"
              />
              <p className="text-xs text-muted-foreground">
                {formData.same_day_booking_cutoff === 0
                  ? '公演開始まで予約可能'
                  : `公演開始の${formData.same_day_booking_cutoff}時間前まで予約可能`}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">貸切予約の受付締切（日前）</Label>
            <Input
              type="number"
              value={formData.private_booking_deadline_days}
              onChange={(e) => setFormData(prev => ({ ...prev, private_booking_deadline_days: parseInt(e.target.value) || 0 }))}
              min="0"
              max="90"
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">
              公演日の{formData.private_booking_deadline_days}日前まで貸切申込を受付。貸切申込フォームの締切に使用されます
            </p>
          </div>
        </div>
      </section>

      {/* 参加人数 */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={Users}
          label="参加人数"
          description="1回の予約で申し込める最大人数を設定します。予約フォームの人数上限として機能します"
        />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">1回の予約の最大人数</Label>
              <Input
                type="number"
                value={formData.max_participants_per_booking}
                onChange={(e) => setFormData(prev => ({ ...prev, max_participants_per_booking: parseInt(e.target.value) || 0 }))}
                min="1"
                max="50"
              />
              <p className="text-xs text-muted-foreground">予約フォームで選択できる人数の上限です</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">顧客あたりの最大予約数</Label>
              <Input
                type="number"
                value={formData.max_bookings_per_customer || 0}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0
                  setFormData(prev => ({ ...prev, max_bookings_per_customer: value === 0 ? null : value }))
                }}
                min="0"
                max="20"
              />
              <p className="text-xs text-muted-foreground">0 = 制限なし</p>
            </div>
          </div>
        </div>
      </section>

      {/* 本人確認・支払い */}
      <section className="bg-white rounded-xl border p-6">
        <SectionTitle
          icon={ShieldCheck}
          label="本人確認・支払い"
          description="電話番号確認の要否と、予約確認画面に表示される支払い方法の表示内容を設定します"
        />
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">電話番号認証を要求</p>
              <p className="text-xs text-muted-foreground">有効にすると、予約時に電話番号の認証が必須になります</p>
            </div>
            <Switch
              checked={formData.require_phone_verification}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, require_phone_verification: checked }))}
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">支払い方法の名称</Label>
              <Input
                value={formData.payment_method_label}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_method_label: e.target.value }))}
                placeholder="現地決済"
              />
              <p className="text-xs text-muted-foreground">例: 現地決済、当日現金払い、カード決済可 など</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">支払い方法の説明文</Label>
              <Input
                value={formData.payment_method_description}
                onChange={(e) => setFormData(prev => ({ ...prev, payment_method_description: e.target.value }))}
                placeholder="ご来店時にお支払いください"
              />
              <p className="text-xs text-muted-foreground">予約確認画面・確認メールに表示される補足説明です</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
